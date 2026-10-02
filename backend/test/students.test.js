// Student CRUD API tests. Run: npm test  (needs the test DB, see `npm run test:db`)
// Uses Node's built-in runner + fetch against the real Express app and a separate Postgres DB.
const { test, describe, before, after, afterEach, mock } = require("node:test");
const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");
const path = require("node:path");

require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

// Never touch the dev DB: use TEST_DATABASE_URL, else the dev URL with the db name swapped for *_test.
process.env.DATABASE_URL =
    process.env.TEST_DATABASE_URL || process.env.DATABASE_URL.replace(/\/[^/?]+(\?|$)/, "/school_mgmt_test$1");
assert.match(process.env.DATABASE_URL, /_test(\?|$)/, "refusing to run tests against a non-test database");

// Stub the mail sender before the app loads (no real emails); flip sendState.fail to simulate an outage.
const sendState = { fail: false, sent: [] };
const mailPath = require.resolve("../src/utils/send-email");
require.cache[mailPath] = {
    id: mailPath, filename: mailPath, loaded: true,
    exports: {
        sendMail: async (options) => {
            if (sendState.fail) throw new Error("mail down");
            sendState.sent.push(options);
        }
    }
};

const { app } = require("../src/app");
const { db, env } = require("../src/config");
const { generateToken, generateCsrfHmacHash } = require("../src/utils");

const CSRF = "test-csrf-token";
const cookieFor = (id, roleId) => {
    const access = generateToken({ id, role: "x", roleId, csrf_hmac: generateCsrfHmacHash(CSRF) }, env.JWT_ACCESS_TOKEN_SECRET, "15m");
    const refresh = generateToken({ id, role: "x", roleId }, env.JWT_REFRESH_TOKEN_SECRET, "15m");
    return `accessToken=${access}; refreshToken=${refresh}`;
};
const ADMIN = cookieFor(1, 1);
const ROUTES = [["GET", "/students"], ["POST", "/students"], ["GET", "/students/1"], ["PUT", "/students/1"], ["POST", "/students/1/status"], ["DELETE", "/students/1"]];
const tokenPair = (accessTime, refreshSecret = env.JWT_REFRESH_TOKEN_SECRET) => {
    const access = generateToken({ id: 1, role: "x", roleId: 1, csrf_hmac: generateCsrfHmacHash(CSRF) }, env.JWT_ACCESS_TOKEN_SECRET, accessTime);
    return { access, refresh: generateToken({ id: 1, role: "x", roleId: 1 }, refreshSecret, "15m") };
};
const STUDENT_ROLE = cookieFor(999, 3); // no permission rows for the students APIs

let server, base;
const call = async (method, url, { body, cookie = ADMIN, csrf = CSRF } = {}) => {
    const res = await fetch(base + "/api/v1" + url, {
        method,
        headers: { "content-type": "application/json", ...(csrf && { "x-csrf-token": csrf }), ...(cookie && { cookie }) },
        body: method === "GET" || body === undefined ? undefined : JSON.stringify(body)
    });
    return { status: res.status, body: await res.json().catch(() => null) };
};

const newStudent = (overrides = {}) => ({
    name: "Crud Student",
    email: `crud-${randomUUID()}@example.com`,
    gender: "Male",
    phone: "9999999999",
    dob: "2012-05-01",
    admissionDate: "2024-04-01T00:00:00.000Z",
    class: "Test class",
    section: "Test section",
    roll: "7",
    currentAddress: "addr",
    permanentAddress: "addr",
    fatherName: "F", fatherPhone: "", motherName: "M", motherPhone: "",
    guardianName: "G", guardianPhone: "9999999998", relationOfGuardian: "Father",
    systemAccess: true,
    ...overrides
});
const idOf = async (email) => (await db.query("SELECT id FROM users WHERE email = $1", [email])).rows[0]?.id;
const create = async (overrides) => {
    const payload = newStudent(overrides);
    const res = await call("POST", "/students", { body: payload });
    assert.ok([200, 201].includes(res.status), `create failed: ${res.status} ${JSON.stringify(res.body)}`);
    return { payload, id: await idOf(payload.email) };
};

before(async () => {
    // the app logs every handled ApiError; keep the test output readable
    mock.method(console, "error", () => {});
    mock.method(console, "log", () => {});
    await db.query("INSERT INTO classes (name) VALUES ('Test class') ON CONFLICT DO NOTHING");
    await db.query("INSERT INTO sections (name) VALUES ('Test section') ON CONFLICT DO NOTHING");
    await new Promise((resolve) => { server = app.listen(0, resolve); });
    base = `http://127.0.0.1:${server.address().port}`;
});

afterEach(async () => {
    sendState.fail = false;
    await db.query("DELETE FROM user_profiles WHERE user_id IN (SELECT id FROM users WHERE email LIKE 'crud-%@example.com')");
    await db.query("DELETE FROM users WHERE email LIKE 'crud-%@example.com'");
});

after(async () => {
    await new Promise((resolve) => server.close(resolve));
    await db.end();
});

describe("auth & access", () => {
    test("401 on every route without tokens", async () => {
        for (const [method, url] of ROUTES) {
            assert.equal((await call(method, url, { cookie: null, body: newStudent() })).status, 401, `${method} ${url}`);
        }
    });
    test("401 when only one of the two tokens is present", async () => {
        const { access, refresh } = tokenPair("15m");
        assert.equal((await call("GET", "/students", { cookie: `accessToken=${access}` })).status, 401);
        assert.equal((await call("GET", "/students", { cookie: `refreshToken=${refresh}` })).status, 401);
    });
    test("401 for a malformed, wrongly signed or expired token", async () => {
        const { access, refresh } = tokenPair("15m");
        const expired = tokenPair(-10);
        const forged = tokenPair("15m", "not-the-real-secret");
        for (const [name, cookie] of [
            ["malformed access", `accessToken=garbage; refreshToken=${refresh}`],
            ["expired access", `accessToken=${expired.access}; refreshToken=${refresh}`],
            ["bad refresh signature", `accessToken=${access}; refreshToken=${forged.refresh}`]
        ]) {
            assert.equal((await call("GET", "/students", { cookie })).status, 401, name);
        }
    });
    test("403 for a role without permission", async () => {
        for (const [method, url] of [["GET", "/students"], ["POST", "/students"], ["PUT", "/students/1"], ["DELETE", "/students/1"]]) {
            assert.equal((await call(method, url, { cookie: STUDENT_ROLE, body: newStudent() })).status, 403, `${method} ${url}`);
        }
    });
});

describe("csrf", () => {
    test("400 on every state-changing and read route when the CSRF header is missing", async () => {
        for (const [method, url] of ROUTES) {
            assert.equal((await call(method, url, { csrf: null, body: newStudent() })).status, 400, `${method} ${url}`);
        }
    });
    test("403 on every route when the CSRF token does not match the access token", async () => {
        for (const [method, url] of ROUTES) {
            assert.equal((await call(method, url, { csrf: "someone-elses-token", body: newStudent() })).status, 403, `${method} ${url}`);
        }
    });
    test("a rejected CSRF check does not change data", async () => {
        const { id } = await create();
        await call("DELETE", `/students/${id}`, { csrf: "wrong" });
        await call("PUT", `/students/${id}`, { csrf: "wrong", body: newStudent({ name: "Nope" }) });
        const detail = await call("GET", `/students/${id}`);
        assert.equal(detail.status, 200);
        assert.equal(detail.body.name, "Crud Student");
    });
    test("the CSRF check runs before permission and validation", async () => {
        assert.equal((await call("POST", "/students", { csrf: "wrong", cookie: STUDENT_ROLE, body: { email: "nope" } })).status, 403);
    });
});

describe("create", () => {
    test("creates a student, sends the verification email, detail is readable", async () => {
        const { payload, id } = await create();
        assert.ok(id);
        assert.equal(sendState.sent.at(-1).to, payload.email);
        const detail = await call("GET", `/students/${id}`);
        assert.equal(detail.status, 200);
        assert.equal(detail.body.email, payload.email);
        assert.equal(detail.body.roll, "7"); // string, matching the frontend type
        assert.equal(detail.body.class, "Test class");
    });
    test("still succeeds (with a warning message) when the email provider is down", async () => {
        sendState.fail = true;
        const res = await call("POST", "/students", { body: newStudent() });
        assert.ok([200, 201].includes(res.status));
        assert.match(res.body.message, /failed to send verification email/);
    });
    test("409 on duplicate email", async () => {
        const { payload } = await create();
        const res = await call("POST", "/students", { body: newStudent({ email: payload.email }) });
        assert.equal(res.status, 409);
        assert.equal(res.body.error, "Email already exists");
    });
    test("400 on invalid body", async () => {
        for (const bad of [{ email: "nope" }, { name: "" }, { roll: '"1"' }, { dob: "not-a-date" }, { systemAccess: "yes" }]) {
            assert.equal((await call("POST", "/students", { body: newStudent(bad) })).status, 400, JSON.stringify(bad));
        }
    });
    test("a userId in the body cannot overwrite an existing user", async () => {
        const before = (await db.query("SELECT name, role_id FROM users WHERE id = 1")).rows[0];
        const payload = newStudent({ userId: 1, name: "Hijack" });
        const res = await call("POST", "/students", { body: payload });
        assert.ok([200, 201].includes(res.status));
        const after = (await db.query("SELECT name, role_id FROM users WHERE id = 1")).rows[0];
        assert.deepEqual(after, before);
        assert.notEqual(await idOf(payload.email), 1);
    });
});

describe("read", () => {
    test("list returns an empty array (200) when nothing matches", async () => {
        const res = await call("GET", "/students?name=no-such-student");
        assert.equal(res.status, 200);
        assert.deepEqual(res.body, { students: [] });
    });
    test("list filters by name, class, section and roll together", async () => {
        const { payload, id } = await create({ name: "Filter Me", roll: "42" });
        const q = new URLSearchParams({ name: "Filter Me", class: "Test class", section: "Test section", roll: "42" });
        const hit = await call("GET", `/students?${q}`);
        assert.deepEqual(hit.body.students.map((s) => s.id), [id]);
        const miss = await call("GET", `/students?${new URLSearchParams({ name: "Filter Me", roll: "43" })}`);
        assert.deepEqual(miss.body.students, []);
        assert.equal(hit.body.students[0].email, payload.email);
    });
    test("list never includes non-students (the admin)", async () => {
        const res = await call("GET", "/students");
        assert.ok(!res.body.students.some((s) => s.id === 1));
    });
    test("400 on repeated query params", async () => {
        assert.equal((await call("GET", "/students?name=a&name=b")).status, 400);
    });
    test("detail: 404 unknown, 404 for a non-student, 400 for a bad id", async () => {
        assert.equal((await call("GET", "/students/999999")).status, 404);
        assert.equal((await call("GET", "/students/1")).status, 404);
        assert.equal((await call("GET", "/students/abc")).status, 400);
        assert.equal((await call("GET", "/students/99999999999")).status, 400);
    });
});

describe("update", () => {
    test("updates user and profile fields", async () => {
        const { payload, id } = await create();
        const res = await call("PUT", `/students/${id}`, {
            body: { ...payload, name: "Renamed", roll: "9", systemAccess: false, currentAddress: "new addr" }
        });
        assert.equal(res.status, 200);
        const detail = (await call("GET", `/students/${id}`)).body;
        assert.equal(detail.name, "Renamed");
        assert.equal(detail.roll, "9");
        assert.equal(detail.systemAccess, false);
        assert.equal(detail.currentAddress, "new addr");
    });
    test("the URL id wins over a userId in the body", async () => {
        const a = await create();
        const b = await create();
        await call("PUT", `/students/${a.id}`, { body: { ...a.payload, userId: b.id, name: "Only A" } });
        assert.equal((await call("GET", `/students/${a.id}`)).body.name, "Only A");
        assert.equal((await call("GET", `/students/${b.id}`)).body.name, "Crud Student");
    });
    test("404 for an unknown id, and it does not create a student", async () => {
        const payload = newStudent();
        assert.equal((await call("PUT", "/students/999999", { body: payload })).status, 404);
        assert.equal(await idOf(payload.email), undefined);
    });
    test("404 for the admin, who must stay an admin", async () => {
        assert.equal((await call("PUT", "/students/1", { body: newStudent() })).status, 404);
        assert.equal((await db.query("SELECT role_id FROM users WHERE id = 1")).rows[0].role_id, 1);
    });
    test("409 when the new email belongs to someone else", async () => {
        const a = await create();
        const b = await create();
        const res = await call("PUT", `/students/${b.id}`, { body: { ...b.payload, email: a.payload.email } });
        assert.equal(res.status, 409);
    });
    test("400 on invalid id or body", async () => {
        const { payload, id } = await create();
        assert.equal((await call("PUT", "/students/abc", { body: payload })).status, 400);
        assert.equal((await call("PUT", `/students/${id}`, { body: { ...payload, email: "nope" } })).status, 400);
    });
});

describe("status", () => {
    test("disables and enables, recording the reviewer", async () => {
        const { id } = await create();
        const off = await call("POST", `/students/${id}/status`, { body: { status: false } });
        assert.equal(off.status, 200);
        let row = (await db.query("SELECT is_active, status_last_reviewer_id FROM users WHERE id = $1", [id])).rows[0];
        assert.equal(row.is_active, false);
        assert.equal(row.status_last_reviewer_id, 1);
        await call("POST", `/students/${id}/status`, { body: { status: true } });
        row = (await db.query("SELECT is_active FROM users WHERE id = $1", [id])).rows[0];
        assert.equal(row.is_active, true);
    });
    test("400 for a non-boolean status, 404 for unknown and non-student ids", async () => {
        const { id } = await create();
        assert.equal((await call("POST", `/students/${id}/status`, { body: { status: "yes" } })).status, 400);
        assert.equal((await call("POST", `/students/${id}/status`, { body: {} })).status, 400);
        assert.equal((await call("POST", "/students/999999/status", { body: { status: false } })).status, 404);
        assert.equal((await call("POST", "/students/1/status", { body: { status: false } })).status, 404);
    });
});

describe("delete", () => {
    test("deletes the student and its profile", async () => {
        const { id } = await create();
        assert.equal((await call("DELETE", `/students/${id}`)).status, 200);
        assert.equal((await call("GET", `/students/${id}`)).status, 404);
        const profile = await db.query("SELECT 1 FROM user_profiles WHERE user_id = $1", [id]);
        assert.equal(profile.rowCount, 0);
    });
    test("404 when already deleted or unknown", async () => {
        const { id } = await create();
        await call("DELETE", `/students/${id}`);
        assert.equal((await call("DELETE", `/students/${id}`)).status, 404);
        assert.equal((await call("DELETE", "/students/999999")).status, 404);
    });
    test("cannot delete a non-student, and leaves its data intact", async () => {
        const profilesBefore = (await db.query("SELECT count(*)::int AS n FROM user_profiles")).rows[0].n;
        assert.equal((await call("DELETE", "/students/1")).status, 404);
        assert.equal((await db.query("SELECT 1 FROM users WHERE id = 1")).rowCount, 1);
        assert.equal((await db.query("SELECT count(*)::int AS n FROM user_profiles")).rows[0].n, profilesBefore);
    });
    test("400 on a bad id", async () => {
        assert.equal((await call("DELETE", "/students/abc")).status, 400);
    });
});

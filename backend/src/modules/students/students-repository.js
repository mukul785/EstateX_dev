const { processDBRequest } = require("../../utils");

const STUDENT_ROLE_ID = 3;

const getRoleId = async (roleName) => {
    const query = "SELECT id FROM roles WHERE name ILIKE $1";
    const queryParams = [roleName];
    const { rows } = await processDBRequest({ query, queryParams });
    return rows[0].id;
}

const findAllStudents = async (payload) => {
    const { name, className, section, roll } = payload;
    let query = `
        SELECT
            t1.id,
            t1.name,
            t1.email,
            t1.last_login AS "lastLogin",
            t1.is_active AS "systemAccess"
        FROM users t1
        LEFT JOIN user_profiles t3 ON t1.id = t3.user_id
        WHERE t1.role_id = 3`;
    let queryParams = [];
    if (name) {
        query += ` AND t1.name = $${queryParams.length + 1}`;
        queryParams.push(name);
    }
    if (className) {
        query += ` AND t3.class_name = $${queryParams.length + 1}`;
        queryParams.push(className);
    }
    if (section) {
        query += ` AND t3.section_name = $${queryParams.length + 1}`;
        queryParams.push(section);
    }
    if (roll) {
        query += ` AND t3.roll = $${queryParams.length + 1}`;
        queryParams.push(roll);
    }

    query += ' ORDER BY t1.id';

    const { rows } = await processDBRequest({ query, queryParams });
    return rows;
}

const addOrUpdateStudent = async (payload) => {
    const query = "SELECT * FROM student_add_update($1)";
    const queryParams = [payload];
    const { rows } = await processDBRequest({ query, queryParams });
    return rows[0];
}

const findStudentDetail = async (id) => {
    const query = `
        SELECT
            u.id,
            u.name,
            u.email,
            u.is_active AS "systemAccess",
            p.phone,
            p.gender,
            p.dob,
            p.class_name AS "class",
            p.section_name AS "section",
            p.roll::text AS roll,
            p.father_name AS "fatherName",
            p.father_phone AS "fatherPhone",
            p.mother_name AS "motherName",
            p.mother_phone AS "motherPhone",
            p.guardian_name AS "guardianName",
            p.guardian_phone AS "guardianPhone",
            p.relation_of_guardian as "relationOfGuardian",
            p.current_address AS "currentAddress",
            p.permanent_address AS "permanentAddress",
            p.admission_dt AS "admissionDate",
            r.name as "reporterName"
        FROM users u
        LEFT JOIN user_profiles p ON u.id = p.user_id
        LEFT JOIN users r ON u.reporter_id = r.id
        WHERE u.id = $1`;
    const queryParams = [id];
    const { rows } = await processDBRequest({ query, queryParams });
    return rows[0];
}

const findStudentToSetStatus = async ({ userId, reviewerId, status }) => {
    const now = new Date();
    const query = `
        UPDATE users
        SET
            is_active = $1,
            status_last_reviewed_dt = $2,
            status_last_reviewer_id = $3
        WHERE id = $4
    `;
    const queryParams = [status, now, reviewerId, userId];
    const { rowCount } = await processDBRequest({ query, queryParams });
    return rowCount
}

const findStudentById = async (id) => {
    const query = "SELECT id FROM users WHERE id = $1 AND role_id = $2";
    const { rows } = await processDBRequest({ query, queryParams: [id, STUDENT_ROLE_ID] });
    return rows[0];
}

// one statement = atomic; every step is scoped to the student row `s`, so a non-student id deletes nothing
const removeStudent = async (id) => {
    const query = `
        WITH s AS (SELECT id FROM users WHERE id = $1 AND role_id = $2),
             l AS (DELETE FROM user_leaves WHERE user_id IN (SELECT id FROM s)),
             p AS (DELETE FROM user_leave_policy WHERE user_id IN (SELECT id FROM s)),
             t AS (DELETE FROM user_profiles WHERE user_id IN (SELECT id FROM s))
        DELETE FROM users WHERE id IN (SELECT id FROM s)`;
    const { rowCount } = await processDBRequest({ query, queryParams: [id, STUDENT_ROLE_ID] });
    return rowCount;
}

module.exports = {
    removeStudent,
    findStudentById,
    getRoleId,
    findAllStudents,
    addOrUpdateStudent,
    findStudentDetail,
    findStudentToSetStatus
};

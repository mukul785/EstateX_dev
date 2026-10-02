const { z } = require("zod");

const MAX_PG_INT = 2147483647;
const id = z.string().regex(/^\d+$/, "Id must be a positive integer").refine((v) => Number(v) <= MAX_PG_INT, "Id is out of range");
const date = z.string().refine((v) => !Number.isNaN(Date.parse(v)), "Invalid date");
const text = z.string().max(255);

const studentBody = z.object({
    name: text.min(1, "Name is required"),
    email: z.string().email("Invalid email").max(255),
    gender: text.optional(),
    phone: text.optional(),
    dob: date.optional(),
    admissionDate: date.optional(),
    class: text.optional(),
    section: text.optional(),
    roll: z.union([z.string().regex(/^\d+$/, "Roll must be a number"), z.number().int()]).optional(),
    currentAddress: z.string().optional(),
    permanentAddress: z.string().optional(),
    fatherName: text.optional(),
    fatherPhone: text.optional(),
    motherName: text.optional(),
    motherPhone: text.optional(),
    guardianName: text.optional(),
    guardianPhone: text.optional(),
    relationOfGuardian: text.optional(),
    systemAccess: z.boolean().optional()
});

const StudentListSchema = z.object({
    query: z.object({
        name: z.string().optional(),
        class: z.string().optional(),
        section: z.string().optional(),
        roll: z.string().optional()
    })
});
const StudentIdSchema = z.object({ params: z.object({ id }) });
const AddStudentSchema = z.object({ body: studentBody });
const UpdateStudentSchema = z.object({ params: z.object({ id }), body: studentBody });
const StudentStatusSchema = z.object({ params: z.object({ id }), body: z.object({ status: z.boolean() }) });

module.exports = { StudentListSchema, StudentIdSchema, AddStudentSchema, UpdateStudentSchema, StudentStatusSchema };

const express = require("express");
const router = express.Router();
const studentController = require("./students-controller");
const { checkApiAccess } = require("../../middlewares");
const { validateRequest } = require("../../utils");
const { StudentListSchema, StudentIdSchema, AddStudentSchema, UpdateStudentSchema, StudentStatusSchema } = require("./students-schema");

router.get("", checkApiAccess, validateRequest(StudentListSchema), studentController.handleGetAllStudents);
router.post("", checkApiAccess, validateRequest(AddStudentSchema), studentController.handleAddStudent);
router.get("/:id", checkApiAccess, validateRequest(StudentIdSchema), studentController.handleGetStudentDetail);
router.post("/:id/status", checkApiAccess, validateRequest(StudentStatusSchema), studentController.handleStudentStatus);
router.put("/:id", checkApiAccess, validateRequest(UpdateStudentSchema), studentController.handleUpdateStudent);
router.delete("/:id", checkApiAccess, validateRequest(StudentIdSchema), studentController.handleDeleteStudent);

module.exports = { studentsRoutes: router };

const { ApiError, sendAccountVerificationEmail } = require("../../utils");
const { ERROR_MESSAGES, SUCCESS_MESSAGES } = require("../../constants");
const { findAllStudents, findStudentDetail, findStudentById, findStudentToSetStatus, addOrUpdateStudent, removeStudent } = require("./students-repository");

// student_add_update reports failures as rows; log the DB detail, send the client a safe message
const toSaveError = (result) => {
    console.error("student_add_update failed:", result.message, result.description);
    if (result.message === ERROR_MESSAGES.EMAIL_EXISTS || /duplicate key/i.test(result.description || "")) {
        return new ApiError(409, ERROR_MESSAGES.EMAIL_EXISTS);
    }
    return new ApiError(500, result.message || "Unable to save student");
}

const checkStudentId = async (id) => {
    const isStudentFound = await findStudentById(id);
    if (!isStudentFound) {
        throw new ApiError(404, ERROR_MESSAGES.STUDENT_NOT_FOUND);
    }
}

const getStudentDetail = async (id) => {
    await checkStudentId(id);

    const student = await findStudentDetail(id);
    if (!student) {
        throw new ApiError(404, ERROR_MESSAGES.STUDENT_NOT_FOUND);
    }

    return student;
}

const addNewStudent = async (payload) => {
    const result = await addOrUpdateStudent(payload);
    if (!result.status) {
        throw toSaveError(result);
    }

    try {
        await sendAccountVerificationEmail({ userId: result.userId, userEmail: payload.email });
        return { message: SUCCESS_MESSAGES.STUDENT_ADDED_EMAIL_SENT };
    } catch (error) {
        console.error("Verification email failed for user", result.userId, error);
        return { message: SUCCESS_MESSAGES.STUDENT_ADDED_EMAIL_FAILED }
    }
}

const updateStudent = async (payload) => {
    await checkStudentId(payload.userId);

    const result = await addOrUpdateStudent(payload);
    if (!result.status) {
        throw toSaveError(result);
    }

    return { message: result.message };
}

const setStudentStatus = async ({ userId, reviewerId, status }) => {
    await checkStudentId(userId);

    const affectedRow = await findStudentToSetStatus({ userId, reviewerId, status });
    if (affectedRow <= 0) {
        throw new ApiError(500, "Unable to disable student");
    }

    return { message: "Student status changed successfully" };
}

const deleteStudent = async (id) => {
    const affectedRow = await removeStudent(id);
    if (affectedRow <= 0) {
        throw new ApiError(404, ERROR_MESSAGES.STUDENT_NOT_FOUND);
    }

    return { message: "Student deleted successfully" };
}

module.exports = {
    getAllStudents: findAllStudents,
    getStudentDetail,
    addNewStudent,
    updateStudent,
    setStudentStatus,
    deleteStudent,
};

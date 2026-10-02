const ERROR_MESSAGES = {
    DATABASE_ERROR: "An error occurred while processing your request. Please try again later.",
    EMAIL_EXISTS: "Email already exists", // must match student_add_update in seed_db/tables.sql
    STUDENT_NOT_FOUND: "Student not found",
};

module.exports = { ERROR_MESSAGES };

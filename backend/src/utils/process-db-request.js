const { db } = require("../config");
const { ERROR_MESSAGES } = require("../constants");
const { ApiError } = require("./api-error");

// Postgres SQLSTATE -> [status, message] for errors caused by the request, not the server
const PG_CLIENT_ERRORS = {
    "23505": [409, "Resource already exists"],
    "23503": [409, "Request conflicts with related records"],
    "22P02": [400, "Invalid input"],
    "22003": [400, "Value out of range"]
};

const processDBRequest = async ({ query, queryParams }) => {
    try {
        const result = await db.query(query, queryParams);
        return result;
    } catch (error) {
        console.log(error);
        // console.error(error.message); //save this error log in db
        const mapped = PG_CLIENT_ERRORS[error.code];
        throw mapped ? new ApiError(...mapped) : new ApiError(500, ERROR_MESSAGES.DATABASE_ERROR);
    }
}

module.exports = { processDBRequest };
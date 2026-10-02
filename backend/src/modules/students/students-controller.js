const asyncHandler = require("express-async-handler");
const { getAllStudents, addNewStudent, getStudentDetail, setStudentStatus, updateStudent, deleteStudent } = require("./students-service");

const handleGetAllStudents = asyncHandler(async (req, res) => {
    const { name, class: className, section, roll } = req.query;
    const students = await getAllStudents({ name, className, section, roll });
    res.json({ students });
});

const handleAddStudent = asyncHandler(async (req, res) => {
    // student_add_update treats a userId in the data as an update, so never let the client set it on create
    const { userId, ...payload } = req.body;
    const message = await addNewStudent(payload);
    res.json(message);
});

const handleUpdateStudent = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const payload = req.body;
    const message = await updateStudent({ ...payload, userId: id });
    res.json(message);
});

const handleGetStudentDetail = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const student = await getStudentDetail(id);
    res.json(student);

});

const handleStudentStatus = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { status } = req.body;
    const message = await setStudentStatus({ userId: id, reviewerId: req.user.id, status });
    res.json(message);
});

const handleDeleteStudent = asyncHandler(async (req, res) => {
    const message = await deleteStudent(req.params.id);
    res.json(message);
});

module.exports = {
    handleDeleteStudent,
    handleGetAllStudents,
    handleGetStudentDetail,
    handleAddStudent,
    handleStudentStatus,
    handleUpdateStudent,
};

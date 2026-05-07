const ALLOWED_EXTENSIONS = [".pdf", ".doc", ".docx", ".md", ".txt"];

const MIME_MAP = {
    ".pdf": "application/pdf",
    ".doc": "application/msword",
    ".docx":
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ".md": "text/plain",
    ".txt": "text/plain",
};

module.exports = { ALLOWED_EXTENSIONS, MIME_MAP };

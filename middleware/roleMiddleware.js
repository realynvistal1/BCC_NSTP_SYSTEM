function requireProgram(program) {
  return (req, res, next) => {
    req.params.program = String(program || "").toLowerCase();
    next();
  };
}

module.exports = { requireProgram };

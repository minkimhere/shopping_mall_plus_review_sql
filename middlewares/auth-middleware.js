const jwt = require("jsonwebtoken");
const { User } = require("../models");

module.exports = (req, res, next) => {
  const { authorization } = req.headers;
  const [tokenType, tokenValue] = authorization.split(" ");

  if (tokenType !== "Bearer") {
    return res.status(401).json({ errorMessage: "로그인 후 사용하세요." });
  }

  try {
    const { userId } = jwt.verify(tokenValue, "test-secret-key");
    User.findByPk(userId).then((user) => { // findByPrimaryKey
      res.locals.user = user;
      next();
    });
  } catch (error) {
    return res.status(401).json({ errorMessage: "로그인 후 사용하세요." });
  }
};

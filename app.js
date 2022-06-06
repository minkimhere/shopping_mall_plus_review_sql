const express = require("express");
const mongoose = require("mongoose");
const jwt = require("jsonwebtoken");
const Joi = require("joi");
const { User } = require("./models"); // index에 연결해서 사용됨
const Cart = require("./models/cart");
const Goods = require("./models/goods");
const authMiddleware = require("./middlewares/auth-middleware");

const app = express();
const router = express.Router();

const port = 8080;

const connect = () => {
  mongoose
    .connect("mongodb://localhost/shopping-demo-plus")
    .catch((err) => console.error(err));
};

connect();

const postUserSchema = Joi.object({
  nickname: Joi.string().required(),
  email: Joi.string().email().required(),
  password: Joi.string().required(),
  confirmPassword: Joi.string().required(),
});

router.post("/users", async (req, res) => {
  try {
    const { email, nickname, password, confirmPassword } =
      await postUserSchema.validateAsync(req.body);

    if (password !== confirmPassword) {
      return res.status(400).json({
        errorMessage: "패스워드가 패스워드 확인란과 동일하지 않습니다.",
      });
    }

    const existUser = await User.find({ $or: [{ nickname }, { email }] });

    if (existUser.length) {
      return res.status(400).json({
        errorMessage: "이미 가입된 이메일 또는 닉네임이 있습니다.",
      });
    }

    const user = new User({ email, nickname, password });
    await user.save();

    res.status(201).json({});
  } catch (error) {
    res
      .status(400)
      .json({ errorMessage: "요청한 데이터 형식이 올바르지 않습니다." });
  }
});

const postAuthSchema = Joi.object({
  email: Joi.string().email().required(),
  password: Joi.string().required(),
});

router.post("/auth", async (req, res) => {
  try {
    const { email, password } = await postAuthSchema.validateAsync(req.body);

    const user = await User.findOne({ email, password }).exec();

    if (!user) {
      return res // 401 :인증실패
        .status(401)
        .json({ errorMessage: "이메일 또는 패스워드가 잘못 입력하셨습니다." });
    }

    const token = jwt.sign({ userId: user.userId }, "test-secret-key");

    res.json({ token });
  } catch (error) {
    res
      .status(400)
      .json({ errorMessage: "요청한 데이터 형식이 올바르지 않습니다." });
  }
});

router.get("/users/me", authMiddleware, async (req, res) => {
  const { user } = res.locals;

  res.json({
    user: {
      email: user.email,
      nickname: user.nickname,
    },
  });
});

/**
 * 내가 가진 장바구니 목록을 전부 불러온다.
 */
router.get("/goods/cart", authMiddleware, async (req, res) => {
  const { userId } = res.locals.user;

  const cart = await Cart.find({
    userId,
  }).exec();

  const goodsIds = cart.map((c) => c.goodsId);

  // 루프 줄이기 위해 Mapping 가능한 객체로 만든것
  const goodsKeyById = await Goods.find({
    _id: { $in: goodsIds },
  })
    .exec()
    .then((goods) =>
      goods.reduce(
        (prev, g) => ({
          ...prev,
          [g.goodsId]: g,
        }),
        {}
      )
    );

  res.send({
    cart: cart.map((c) => ({
      quantity: c.quantity,
      goods: goodsKeyById[c.goodsId],
    })),
  });
});

/**
 * 장바구니에 상품 담기.
 * 장바구니에 상품이 이미 담겨있으면 갯수만 수정한다.
 */
router.put("/goods/:goodsId/cart", authMiddleware, async (req, res) => {
  const { userId } = res.locals.user;
  const { goodsId } = req.params;
  const { quantity } = req.body;

  const existsCart = await Cart.findOne({
    userId,
    goodsId,
  }).exec();

  if (existsCart) {
    existsCart.quantity = quantity;
    await existsCart.save();
  } else {
    const cart = new Cart({
      userId,
      goodsId,
      quantity,
    });
    await cart.save();
  }

  // NOTE: 성공했을때 응답 값을 클라이언트가 사용하지 않는다.
  res.send({});
});

/**
 * 장바구니 항목 삭제
 */
router.delete("/goods/:goodsId/cart", authMiddleware, async (req, res) => {
  const { userId } = res.locals.user;
  const { goodsId } = req.params;

  const existsCart = await Cart.findOne({
    userId,
    goodsId,
  }).exec();

  // 있든 말든 신경 안쓴다. 그냥 있으면 지운다.
  if (existsCart) {
    existsCart.delete();
  }

  // NOTE: 성공했을때 딱히 정해진 응답 값이 없다.
  res.send({});
});

/**
 * 모든 상품 가져오기
 * 상품도 몇개 없는 우리에겐 페이지네이션은 사치다.
 * @example
 * /api/goods
 * /api/goods?category=drink
 * /api/goods?category=drink2
 */
router.get("/goods", authMiddleware, async (req, res) => {
  const { category } = req.query;
  const goods = await Goods.find(category ? { category } : undefined)
    .sort("-date")
    .exec();

  res.send({ goods });
});

/**
 * 상품 하나만 가져오기
 */
router.get("/goods/:goodsId", authMiddleware, async (req, res) => {
  const { goodsId } = req.params;
  const goods = await Goods.findById(goodsId).exec();

  if (!goods) {
    res.status(404).send({});
  } else {
    res.send({ goods });
  }
});

app.use(express.urlencoded({ extended: false }));
app.use(express.json());
app.use("/api", router);
app.use(express.static("assets"));

app.listen(port, () => {
  console.log(port, "서버가 켜졌습니다.");
});

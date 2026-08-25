import cookieParser from "cookie-parser";
import cors from "cors";
import express, {
  type Application,
  NextFunction,
  type Request,
  type Response,
} from "express";
import httpStatus from "http-status";
import z from "zod";
import config from "./app/config";
import { globalErrorHandler } from "./app/middleware/globalErrorHandler";
import { notFound } from "./app/middleware/notFound";
import { AuthRoutes } from "./app/module/auth/auth.route";
import { radisClient } from "./app/lib/radisConection";
import crypto from "crypto";
import { userRoute } from "./app/module/user/user.route";

const app: Application = express();

app.use(
  cors({
    origin: config.frontend_url,
    credentials: true,
  }),
);

// Enable URL-encoded form data parsing
app.use(express.urlencoded({ extended: true }));

// Middleware to parse JSON bodies
app.use(express.json());
app.use(cookieParser());

app.use("/api/v1/auth", AuthRoutes);
app.use("/api/v1/user", userRoute);

app.get("/test", async (req: Request, res: Response) => {
  try {
    // await radisClient.set(
    //   "forgot-password-otp:arafatjibon@gmail.com",
    //   "123456",
    //   {
    //     expiration: {
    //       type: "EX",
    //       value: 60,
    //     },
    //   },
    // );
    const otp = crypto.randomInt(10000, 100000);
    res.status(httpStatus.OK).json({
      success: true,
      message: "Otp sent successfully!",
      data: otp,
    });
  } catch (error) {
    console.log(error);
  }
});

// Basic route
app.get("/", async (req: Request, res: Response) => {
  res.status(httpStatus.OK).json({
    success: true,
    message: "Welcome to PH Healthcare System Backend",
  });
});

app.use(globalErrorHandler);
app.use(notFound);

export default app;

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
import { getBkashIdToken } from "./app/lib/bkash";
import { appointmentRouter } from "./app/module/appointment/appointment.route";

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
app.use("/api/v1/appointment", appointmentRouter);

app.get("/test", async (req: Request, res: Response) => {
  try {
    const result = await getBkashIdToken();
    console.log("bkash==>", result);
    res.status(httpStatus.OK).json({
      success: true,
      message: "bkash thing here!",
      data: null,
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

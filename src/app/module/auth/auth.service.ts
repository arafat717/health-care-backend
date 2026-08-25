/** biome-ignore-all lint/style/useConst: <explanation> */
import bcrypt from "bcryptjs";
import type { TokenPayload } from "google-auth-library";
import path from "path";
import type { JwtPayload, SignOptions } from "jsonwebtoken";
import ejs from "ejs";
import {
  AuthProvider,
  Role,
  UserStatus,
} from "../../../generated/prisma/enums";
import config from "../../config";
import { googleClient } from "../../lib/googleAuth";
import { prisma } from "../../lib/prisma";
import { jwtUtils } from "../../utils/jwt";
import type {
  IForgotPassword,
  IGoogleLoginPayload,
  ILoginUserPayload,
  IRegisterPatientPayload,
  IRequestUser,
  IVerifyOtp,
} from "./auth.interface";
import crypto from "crypto";
import { radisClient } from "../../lib/radisConection";
import { transporter } from "../../lib/nodeMailer";

const registerPatient = async (payload: IRegisterPatientPayload) => {
  const { name, password, patient: patientData } = payload;

  const email = payload.email.trim().toLowerCase();

  const isUserExists = await prisma.user.findUnique({
    where: { email },
  });

  if (isUserExists) {
    throw new Error("User with this email already exists");
  }

  const hashedPassword = await bcrypt.hash(password, 8);

  // stor registration payload into radis
  const redisPayload = {
    name,
    email,
    password: hashedPassword,
    patient: patientData,
  };

  const registrationKey = `"regstration-payload:${email}"`;
  await radisClient.set(registrationKey, JSON.stringify(redisPayload), {
    expiration: {
      type: "EX",
      value: 60 * 5,
    },
  });

  // verify email otp set in redis and sent to email
  const otp = crypto.randomInt(100000, 1000000).toString();
  const key = `"verify-email-otp:${email}"`;
  await radisClient.set(key, otp, {
    expiration: {
      type: "EX",
      value: 60 * 5,
    },
  });

  const templatePath = path.join(
    process.cwd(),
    "/src/app/templates/verify-email-otp.ejs",
  );

  const html = await ejs.renderFile(templatePath, { otp });

  await transporter.sendMail({
    from: config.smtp_mail_sender,
    to: email,
    subject: "Verify your email",
    // text: `Your fogot password otp is ${otp}`,
    html,
  });
};

const verifyMail = async (payload: IVerifyOtp) => {
  const email = payload.email.trim().toLowerCase();
  const { otp } = payload;
  const isUserExists = await prisma.user.findUnique({
    where: { email },
  });

  if (isUserExists) {
    if (isUserExists?.emailVerified) {
      throw new Error("User already verified!");
    }
    if (isUserExists?.status === "BLOCKED") {
      throw new Error("User status blocked!");
    }
    throw new Error("User with this email already exists");
  }

  const key = `"verify-email-otp:${email}"`;
  const radisOtp = await radisClient.get(key);
  console.log(otp, radisOtp);
  if (!radisOtp) {
    throw new Error("Invalid otp!");
  }

  if (radisOtp !== otp) {
    throw new Error("Otp does not match!");
  }

  await radisClient.del([key]);

  const registrationKey = `"regstration-payload:${email}"`;
  const radisPayload = await radisClient.get(registrationKey);

  if (!radisPayload) {
    throw new Error("Radis data is not exists");
  }

  const patientPayload = JSON.parse(radisPayload);

  const createdUser = await prisma.user.create({
    data: {
      name: patientPayload.name,
      email: patientPayload.email,
      password: patientPayload.password,
      role: patientPayload.PATIENT,
      status: UserStatus.ACTIVE,
      emailVerified: true,
      patient: {
        create: {
          name: patientPayload.name,
          email: patientPayload.email,
          contactNumber: patientPayload?.patient?.contactNumber || "",
        },
      },
    },
    omit: { password: true },
    include: { patient: true },
  });

  await radisClient.del([registrationKey]);

  const templatePath = path.join(
    process.cwd(),
    "/src/app/templates/welcome-mail.ejs",
  );

  const html = await ejs.renderFile(templatePath, { otp });

  await transporter.sendMail({
    from: config.smtp_mail_sender,
    to: email,
    subject: "Welcome to book doctor",
    // text: `Your fogot password otp is ${otp}`,
    html,
  });

  const { patient, ...user } = createdUser;
  const jwtPayload = {
    userId: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
  };

  const accessToken = jwtUtils.createToken(
    jwtPayload,
    config.jwt_access_secret,
    config.jwt_access_expires_in as SignOptions,
  );

  const refreshToken = jwtUtils.createToken(
    jwtPayload,
    config.jwt_refresh_secret,
    config.jwt_refresh_expires_in as SignOptions,
  );

  return {
    user,
    patient,
    accessToken,
    refreshToken,
  };
};

const loginUser = async (payload: ILoginUserPayload) => {
  const { password } = payload;
  const email = payload.email.trim().toLowerCase();

  const user = await prisma.user.findUnique({
    where: { email },
  });

  if (!user) {
    throw new Error("User not found");
  }

  if (user.status === UserStatus.BLOCKED) {
    throw new Error("User is blocked");
  }

  if (user.isDeleted || user.status === UserStatus.DELETED) {
    throw new Error("User is deleted");
  }

  if (user.password === null && user.googleId !== null) {
    throw new Error(
      "User Already Has Account Registered With Google. Try To Login With Google.",
    );
  }

  const isPasswordMatched = await bcrypt.compare(
    password,
    user.password as string,
  );

  if (!isPasswordMatched) {
    throw new Error("Invalid credentials");
  }

  const jwtPayload = {
    userId: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
  };

  const accessToken = jwtUtils.createToken(
    jwtPayload,
    config.jwt_access_secret,
    config.jwt_access_expires_in as SignOptions,
  );

  const refreshToken = jwtUtils.createToken(
    jwtPayload,
    config.jwt_refresh_secret,
    config.jwt_refresh_expires_in as SignOptions,
  );

  return {
    accessToken,
    refreshToken,
  };
};

const getMe = async (user: IRequestUser) => {
  const isUserExists = await prisma.user.findUnique({
    where: {
      id: user.userId,
    },
    include: {
      patient: true,
    },
    omit: {
      password: true,
    },
  });

  if (!isUserExists) {
    throw new Error("User not found");
  }

  return isUserExists;
};

const refreshToken = async (token: string) => {
  const verifiedRefreshToken = jwtUtils.verifyToken(
    token,
    config.jwt_refresh_secret,
  );

  if (!verifiedRefreshToken.success || !verifiedRefreshToken.data) {
    throw new Error(
      config.node_env === "development"
        ? verifiedRefreshToken.error
        : "Invalid refresh token",
    );
  }

  const data = verifiedRefreshToken.data as JwtPayload;

  const user = await prisma.user.findUnique({
    where: { id: data.userId },
  });

  if (!user || user.isDeleted || user.status !== UserStatus.ACTIVE) {
    throw new Error("User is inactive or not found");
  }

  const jwtPayload = {
    userId: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
  };

  const accessToken = jwtUtils.createToken(
    jwtPayload,
    config.jwt_access_secret,
    config.jwt_access_expires_in as SignOptions,
  );

  const refreshToken = jwtUtils.createToken(
    jwtPayload,
    config.jwt_refresh_secret,
    config.jwt_refresh_expires_in as SignOptions,
  );

  return {
    accessToken,
    refreshToken,
  };
};

const googleLogin = async (payload: IGoogleLoginPayload) => {
  let googleIdTokenPayload: TokenPayload | null | undefined = null;
  try {
    const ticket = await googleClient.verifyIdToken({
      idToken: payload.idToken,
      audience: config.google_client_id,
    });

    googleIdTokenPayload = ticket.getPayload();
  } catch (error) {
    console.log("Google ID Token Verification Failed", error);
    throw new Error("Invalid Or Expired Google Id Token");
  }

  if (!googleIdTokenPayload) {
    throw new Error("Invalid Or Expired Google Id Token");
  }

  if (!googleIdTokenPayload.email) {
    throw new Error("Google Email Not Found");
  }
  if (!googleIdTokenPayload.name) {
    throw new Error("Google Email User Name Not Found");
  }

  const ifPatientExistWithGoogleAuth = await prisma.user.findUnique({
    where: {
      email: googleIdTokenPayload.email,
      role: Role.PATIENT,
      googleId: googleIdTokenPayload.sub,
    },
  });

  let user = ifPatientExistWithGoogleAuth;

  if (!ifPatientExistWithGoogleAuth) {
    const ifPatientExistWithCredentials = await prisma.user.findUnique({
      where: {
        email: googleIdTokenPayload.email,
        role: Role.PATIENT,
        authProvider: AuthProvider.CREDENTIAL,
      },
    });

    if (ifPatientExistWithCredentials) {
      if (!ifPatientExistWithCredentials.emailVerified) {
        throw new Error("Email Not Verified");
      }

      if (ifPatientExistWithCredentials.status === UserStatus.BLOCKED) {
        throw new Error("User Is Blocked");
      }

      if (
        ifPatientExistWithCredentials.isDeleted ||
        ifPatientExistWithCredentials.status === UserStatus.DELETED
      ) {
        throw new Error("User Is Deleted");
      }

      user = await prisma.user.update({
        where: {
          id: ifPatientExistWithCredentials.id,
        },

        data: {
          googleId: googleIdTokenPayload.sub,
        },
      });
    } else {
      // Google Register
      user = await prisma.user.create({
        data: {
          name: googleIdTokenPayload.name,
          email: googleIdTokenPayload.email,
          role: Role.PATIENT,
          googleId: googleIdTokenPayload.sub,
          authProvider: AuthProvider.GOOGLE,
          emailVerified: true,
          patient: {
            create: {
              name: googleIdTokenPayload.name,
              email: googleIdTokenPayload.email,
            },
          },
        },
      });
    }
  }

  if (!user) {
    throw new Error("User Not Found");
  }

  if (user.status === UserStatus.BLOCKED) {
    throw new Error("User Is Blocked");
  }

  if (user.isDeleted || user.status === UserStatus.DELETED) {
    throw new Error("User Is Deleted");
  }

  const jwtPayload = {
    userId: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
  };

  const accessToken = jwtUtils.createToken(
    jwtPayload,
    config.jwt_access_secret,
    config.jwt_access_expires_in as SignOptions,
  );

  const refreshToken = jwtUtils.createToken(
    jwtPayload,
    config.jwt_refresh_secret,
    config.jwt_refresh_expires_in as SignOptions,
  );

  return {
    accessToken,
    refreshToken,
  };
};

const forgotPassword = async (payload: IForgotPassword) => {
  const { email } = payload;
  const user = await prisma.user.findUnique({
    where: {
      email,
    },
  });

  if (!user) {
    throw new Error("User is not exit!");
  }

  if (user.status === "BLOCKED") {
    throw new Error("User is blocked!");
  }

  if (user.isDeleted || user.status === "DELETED") {
    throw new Error("User is deleted!");
  }

  if (user.authProvider === "GOOGLE" || user.googleId) {
    throw new Error("User has account with google!");
  }

  const otp = crypto.randomInt(100000, 1000000).toString();
  const key = `"forgot-password-otp:${email}"`;
  await radisClient.set(key, otp, {
    expiration: {
      type: "EX",
      value: 60 * 5,
    },
  });

  const templatePath = path.join(
    process.cwd(),
    "/src/app/templates/forgot-password.ejs",
  );

  const html = await ejs.renderFile(templatePath, { otp });

  await transporter.sendMail({
    from: config.smtp_mail_sender,
    to: user.email,
    subject: "Forgot password",
    // text: `Your fogot password otp is ${otp}`,
    html,
  });
};
const resetPassword = async (payload: any) => {
  const { email, password, otp } = payload;
  console.log("email from servie===>", email);
  const user = await prisma.user.findUnique({
    where: {
      email,
    },
  });

  if (!user) {
    throw new Error("User is not exit!");
  }

  if (user.status === "BLOCKED") {
    throw new Error("User is blocked!");
  }

  if (user.isDeleted || user.status === "DELETED") {
    throw new Error("User is deleted!");
  }

  if (user.authProvider === "GOOGLE" || user.googleId) {
    throw new Error("User has account with google!");
  }
  const key = `"forgot-password-otp:${email}"`;
  const radisOtp = await radisClient.get(key);
  console.log(otp, radisOtp);
  if (!radisOtp) {
    throw new Error("Invalid otp!");
  }

  if (radisOtp !== otp) {
    throw new Error("Otp does not match!");
  }

  const hashPassword = await bcrypt.hash(
    password,
    Number(config.bcrypt_salt_rounds),
  );

  await prisma.user.update({
    where: {
      email: user.email,
    },
    data: {
      password: hashPassword,
    },
  });

  await radisClient.del([key]);

  const templatePath = path.join(
    process.cwd(),
    "/src/app/templates/success-mail.ejs",
  );

  const html = await ejs.renderFile(templatePath, {});

  await transporter.sendMail({
    from: config.smtp_mail_sender,
    to: user.email,
    subject: "Password changed",
    html,
  });
};

export const AuthService = {
  registerPatient,
  verifyMail,
  loginUser,
  getMe,
  refreshToken,
  googleLogin,
  forgotPassword,
  resetPassword,
};

import {
  appointmentStatus,
  paymentStatus,
} from "../../../generated/prisma/enums";
import config from "../../config";
import { getBkashIdToken } from "../../lib/bkash";
import { prisma } from "../../lib/prisma";
import { User } from "../../middleware/checkAuth";

const bookAppointment = async (payload: any, user: User) => {
  const transactionResponse = await prisma.$transaction(async (tx) => {
    const appointment = await tx.appointment.create({
      data: {
        status: appointmentStatus.PENDING,
      },
    });

    const bkashIdKey = await getBkashIdToken();
    if (!bkashIdKey) {
      throw new Error("Bkash access token not found!");
    }

    const bkashCreatePaymentResponse = await fetch(
      `${config.bkash_base_url}/tokenized/checkout/create`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          Authorization: bkashIdKey,
          "x-app-key": config.bkash_app_key,
        },
        body: JSON.stringify({
          mode: "0011",
          payerReference: user.email,
          callbackURL: `${config.bkash_callback_url}/appointment/book-appointment/payment/callback`,
          amount: "100",
          currency: "BDT",
          intent: "sale",
          merchantInvoiceNumber: appointment.id,
        }),
      },
    );
    const bkashResponse = await bkashCreatePaymentResponse.json();

    await tx.payments.create({
      data: {
        amount: "100",
        merchantInvoiceNumber: bkashResponse.merchantInvoiceNumber,
        appointmentId: appointment.id,
        gatewayResponse: bkashResponse,
        bkashPaymentId: bkashResponse.paymentID,
        payerReference: user.email,
      },
    });

    return bkashResponse.bkashURL;
  });

  return transactionResponse;
};

const payAppointment = async (payload: any, user: User) => {
  const appointmentId = payload.appointmentId;
  const existingAppointment = await prisma.appointment.findUnique({
    where: {
      id: appointmentId,
    },
  });

  if (!existingAppointment) {
    throw new Error("Appointment does not exits!");
  }

  if (existingAppointment.status !== "PENDING") {
    throw new Error("Appointment is not pending!");
  }

  const bkashIdKey = await getBkashIdToken();
  if (!bkashIdKey) {
    throw new Error("Bkash access token not found!");
  }

  const bkashCreatePaymentResponse = await fetch(
    `${config.bkash_base_url}/tokenized/checkout/create`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: bkashIdKey,
        "x-app-key": config.bkash_app_key,
      },
      body: JSON.stringify({
        mode: "0011",
        payerReference: user.email,
        callbackURL: `${config.bkash_callback_url}/appointment/book-appointment/payment/callback`,
        amount: "100",
        currency: "BDT",
        intent: "sale",
        merchantInvoiceNumber: existingAppointment.id,
      }),
    },
  );
  const bkashResponse = await bkashCreatePaymentResponse.json();

  await prisma.payments.update({
    where: {
      appointmentId: existingAppointment.id,
    },
    data: {
      merchantInvoiceNumber: bkashResponse.merchantInvoiceNumber,
      gatewayResponse: bkashResponse,
      bkashPaymentId: bkashResponse.paymentID,
    },
  });

  return {
    paymentUrl: bkashResponse.bkashURL,
  };
};

const cancelAppointment = async (payload: any) => {
  const transactionResult = await prisma.$transaction(async (tx) => {
    const appointmentId = payload.appointmentId;
    const existingAppointment = await prisma.appointment.findUnique({
      where: {
        id: appointmentId,
      },
      include: {
        payment: true,
      },
    });

    if (!existingAppointment) {
      throw new Error("Appointment does not exits!");
    }

    if (
      existingAppointment.status === "COMPLETE" ||
      existingAppointment.status === "ONGOING"
    ) {
      throw new Error("Appointment is ongoing/complete!");
    }

    if (existingAppointment.status === "CANCELLED") {
      throw new Error("Appointment is Already cancelled!");
    }

    const updateAppointment = tx.appointment.update({
      where: {
        id: existingAppointment.id,
      },
      data: {
        status: appointmentStatus.CANCELLED,
      },
    });

    const bkashIdKey = await getBkashIdToken();
    if (!bkashIdKey) {
      throw new Error("Bkash access token not found!");
    }

    const bkashCreatePaymentResponse = await fetch(
      `${config.bkash_base_url}/tokenized/checkout/payment/refund`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          Authorization: bkashIdKey,
          "x-app-key": config.bkash_app_key,
        },
        body: JSON.stringify({
          paymentID: existingAppointment.payment?.bkashPaymentId,
          trxID: existingAppointment.payment?.bkashTrxId,
          amount: existingAppointment.payment?.amount.toString(),
          sku: "Appointment cancellation",
          reason: "User wants to cancel!",
        }),
      },
    );
    const bkashResponse = await bkashCreatePaymentResponse.json();

    const updatePayment = await tx.payments.update({
      where: {
        appointmentId: existingAppointment.id,
      },
      data: {
        refundedAt: bkashResponse.completedTime,
        refundTrxId: bkashResponse.refundTrxID,
        refundAmount: bkashResponse.amount,
        refunReason: "User wants to cancel!",
        status: paymentStatus.REFUNDED,
        gatewayResponse: bkashResponse,
      },
    });

    return {
      appointment: updateAppointment,
      payment: updatePayment,
    };
  });

  return transactionResult;
};

const bookAppointmentCallback = async (query: {
  paymentID?: string;
  status?: string;
}) => {
  const transactionResult = await prisma.$transaction(async (tx) => {
    const { paymentID, status } = query;

    if (!status) {
      throw new Error("Payment status is missing!");
    }

    if (!paymentID) {
      throw new Error("Payment id is missing!");
    }

    // Execute payment call required by bKash
    const bkashIdKey = await getBkashIdToken();

    if (!bkashIdKey) {
      throw new Error("Bkash id key is missing!");
    }

    const executeResponse = await fetch(
      `${config.bkash_base_url}/tokenized/checkout/execute`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          Authorization: bkashIdKey,
          "x-app-key": config.bkash_app_key,
        },
        body: JSON.stringify({ paymentID }),
      },
    );

    const result = await executeResponse.json();

    if (status === "success") {
      await tx.appointment.update({
        where: {
          id: result.merchantInvoiceNumber,
        },
        data: {
          status: appointmentStatus.CONFIRMED,
        },
      });

      await tx.payments.update({
        where: {
          bkashPaymentId: paymentID,
        },
        data: {
          status: paymentStatus.PAID,
          bkashTrxId: result.trxID,
          paidAt: result.paymentExecuteTime,
          gatewayResponse: result,
        },
      });

      return {
        redirectUrl: `${config.frontend_url}/dashboard/my-appointment?status=success`,
      };
    } else if (status === "failure") {
      await tx.payments.update({
        where: {
          bkashPaymentId: paymentID,
        },
        data: {
          status: paymentStatus.FAILED,
          gatewayResponse: result,
        },
      });
      return {
        redirectUrl: `${config.frontend_url}/dashboard/my-appointment?status=failure`,
      };
    } else if (status === "cancel") {
      await tx.payments.update({
        where: {
          bkashPaymentId: paymentID,
        },
        data: {
          status: paymentStatus.CANCELLED,
          gatewayResponse: result,
        },
      });
      return {
        redirectUrl: `${config.frontend_url}/dashboard/my-appointment?status=cancel`,
      };
    }

    return {
      result,
      redirectUrl: `${config.frontend_url}/dashboard/my-appointment?status=payment_failed`,
    };
  });
  return transactionResult;
};

export const appointmentService = {
  bookAppointment,
  bookAppointmentCallback,
  payAppointment,
  cancelAppointment,
};

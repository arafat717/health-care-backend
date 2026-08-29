import config from "../../config";
import { getBkashIdToken } from "../../lib/bkash";

const bookAppointment = async () => {
  const bkashIdKey = await getBkashIdToken();
  console.log("bkash id key==>", bkashIdKey);
  const createBkashResponse = await fetch(
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
        mode: "0011", // Mode 0011 is for one-time payments (No agreement needed)
        payerReference: "01619777283",
        callbackURL: `${config.bkash_callback_url}/appointment/book-appointment/payment/callback`,
        amount: "1",
        currency: "BDT",
        intent: "sale",
        merchantInvoiceNumber: `Inv_${Date.now()}`, // Must be unique per request
      }),
    },
  );

  const bkashResponse = await createBkashResponse.json();
  console.log(bkashResponse);
  return bkashResponse;
};

const bookAppointmentCallback = async (query: {
  paymentID?: string;
  status?: string;
}) => {
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
    return {
      result,
      redirectUrl: `${config.frontend_url}/dashboard/my-appointment?status=success`,
    };
  }

  if (status === "failure") {
    return {
      result,
      redirectUrl: `${config.frontend_url}/dashboard/my-appointment?status=failure`,
    };
  }
  if (status === "cancel") {
    return {
      result,
      redirectUrl: `${config.frontend_url}/dashboard/my-appointment?status=cancel`,
    };
  }

  return {
    result,
    redirectUrl: `${config.frontend_url}/dashboard/my-appointment`,
  };
};

export const appointmentService = {
  bookAppointment,
  bookAppointmentCallback,
};

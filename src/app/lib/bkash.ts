import config from "../config";
import { radisClient } from "./radisConection";

export const getBkashIdToken = async () => {
  try {
    const bkashIdTokenKey = "bkash:idToken";
    const bkashRefreshTokenKey = "bkash:refreshToken";

    let bkashToken = await radisClient.get(bkashIdTokenKey);
    const bkashRefresh = await radisClient.get(bkashRefreshTokenKey);

    const bkashIdTokenTtl = await radisClient.ttl(bkashIdTokenKey);
    const bkashRefreshTokenTtl = await radisClient.ttl(bkashRefreshTokenKey);

    if (
      (bkashIdTokenTtl <= 600 || !bkashToken) &&
      bkashRefresh &&
      bkashRefreshTokenTtl > 600
    ) {
      const response = await fetch(
        `${config.bkash_base_url}/tokenized/checkout/token/refresh`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
            username: config.bkash_username!,
            password: config.bkash_password,
          },
          body: JSON.stringify({
            app_key: config.bkash_app_key,
            app_secret: config.bkash_app_secret,
            refresh_token: bkashRefresh,
          }),
        },
      );

      const bkashRefreshResponse = await response.json();
      bkashToken = bkashRefreshResponse.id_token as string;

      await radisClient.set(bkashIdTokenKey, bkashToken, {
        expiration: {
          type: "EX",
          value: 60 * 60,
        },
      });

      return bkashToken;
    }

    if (bkashIdTokenTtl > 600) {
      return bkashToken;
    }

    const response = await fetch(
      `${config.bkash_base_url}/tokenized/checkout/token/grant`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          username: config.bkash_username!,
          password: config.bkash_password,
        },
        body: JSON.stringify({
          app_key: config.bkash_app_key,
          app_secret: config.bkash_app_secret,
        }),
      },
    );

    if (!response.ok) {
      throw new Error("Bkash access token grant failed!");
    }

    const result = await response.json();
    // set bksah id token to radis
    await radisClient.set(bkashIdTokenKey, result.id_token, {
      expiration: {
        type: "EX",
        value: 60 * 60,
      },
    });
    // set bkash refresh token to radis
    await radisClient.set(bkashRefreshTokenKey, result.refresh_token, {
      expiration: {
        type: "EX",
        value: 60 * 60 * 24 * 28,
      },
    });

    return result.id_token;
  } catch (error: any) {
    throw new Error(error);
  }
};

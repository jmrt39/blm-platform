import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { expo } from "@better-auth/expo";
import { runableManagedAuth } from "@runablehq/managed-auth/server";
import { db } from "./database";
import { acceptInvitesFor, appOrigin } from "./lib/accept";
import { letter, sendEmail } from "./services/email";

export const auth = betterAuth({
  basePath: "/api/auth",
  baseURL: process.env.WEBSITE_URL,
  database: drizzleAdapter(db, { provider: "sqlite" }),
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 8,
    resetPasswordTokenExpiresIn: 60 * 60,
    revokeSessionsOnPasswordReset: true,
    sendResetPassword: async ({ user, token }, request) => {
      const url = `${appOrigin(request?.headers)}/reset-password?token=${token}`;
      const body = letter({
        heading: "Reset your password",
        lines: [user.name ? `Hello ${user.name},` : "Hello,", "Someone asked to reset the password for your account on The Platform. The link below works for one hour."],
        button: "Choose a new password",
        url,
        foot: "If you didn't ask for this, ignore this email and your password stays as it is.",
      });
      await sendEmail({ to: user.email, subject: "Reset your password", ...body });
    },
    onPasswordReset: async ({ user }) => {
      await acceptInvitesFor(user.id);
    },
  },
  secret: process.env.BETTER_AUTH_SECRET,
  trustedOrigins: (request) => {
    const origin = request?.headers.get("origin");
    return origin ? [origin] : ["*"];
  },
  plugins: [
    ...runableManagedAuth({
      applicationId: process.env.APPLICATION_ID!,
      issuer: process.env.VITE_RUNABLE_AUTH_ISSUER!,
    }),
    expo(),
  ],
});

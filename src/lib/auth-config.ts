import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { db } from "./db";
import { users } from "./schema";
import { eq } from "drizzle-orm";
import { createObjectId } from "./ids";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      name: string;
      email: string;
      isAdmin: boolean;
    };
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    userId?: string;
    isAdmin?: boolean;
    userVerifiedAt?: number;
  }
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
  ],
  session: { strategy: "jwt" },
  pages: {
    signIn: "/",
  },
  callbacks: {
    async signIn({ profile }) {
      if (!profile?.email?.endsWith("@mvrxlabs.com")) {
        return false;
      }
      return true;
    },

    async jwt({ token, trigger }) {
      const shouldSync =
        trigger === "signIn" ||
        !token.userId ||
        !token.userVerifiedAt ||
        Date.now() - (token.userVerifiedAt as number) > 60 * 60 * 1000;

      if (shouldSync && token.email) {
        const email = token.email;
        const [existing] = await db.select().from(users).where(eq(users.email, email)).limit(1);

        if (existing) {
          token.userId = existing.id;
          token.isAdmin = existing.isAdmin;
        } else {
          const [created] = await db
            .insert(users)
            .values({
              id: createObjectId("user"),
              name: token.name || email.split("@")[0],
              email,
              isAdmin: false,
            })
            .returning();
          token.userId = created.id;
          token.isAdmin = false;
        }
        token.userVerifiedAt = Date.now();
      }
      return token;
    },

    async session({ session, token }) {
      if (token.userId) {
        session.user.id = token.userId;
        session.user.isAdmin = token.isAdmin ?? false;
      }
      return session;
    },
  },
});

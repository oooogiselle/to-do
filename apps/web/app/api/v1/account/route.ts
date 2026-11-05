import { z } from "zod";
import { parseBody, route } from "@/lib/api";
import { deleteAccount } from "@/lib/account";

// An explicit body keeps a stray or cross-site DELETE from wiping an account.
const Confirm = z.object({ confirm: z.literal(true) });

/** Permanently deletes the signed-in user's account and all of their data. */
export const DELETE = route(async (req, { user }) => {
  await parseBody(req, Confirm);
  return deleteAccount(user.id);
});

import { createServerFn } from "@tanstack/react-start";
import { getRequestHeaders } from "@tanstack/react-start/server";
import { findOwner } from "./owner.server";

/** The signed-in owner for display. The global gate has already let the request in. */
export const getOwner = createServerFn({ method: "GET" }).handler(async () => {
  const owner = await findOwner(getRequestHeaders());
  if (!owner) throw new Error("Unauthorized");
  return owner;
});

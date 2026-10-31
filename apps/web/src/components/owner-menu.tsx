import { LanguageControl } from "#/components/language-control";
import * as m from "#/paraglide/messages.js";
import { Link } from "@tanstack/react-router";
import { LogOut, Palette, Settings, Type } from "lucide-react";
import { useState } from "react";
import { authClient } from "#/lib/auth-client";
import { signInPath } from "#/lib/sign-in";
import { useDismiss } from "./use-dismiss";

/** "Alex Taylor" → "DM"; a single word gives one letter. */
const initials = (name: string) =>
  name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase())
    .filter((_, index, letters) => index === 0 || index === letters.length - 1)
    .join("");

const itemClassName =
  "flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-sm text-neutral-700 hover:bg-neutral-100 hover:text-neutral-950";

/**
 * The signed-in owner as a round avatar (the GitHub picture, or the initials
 * when there is none or it fails to load) that opens a small menu with the
 * settings and signing out, on phones also type pairings and Brand Kits.
 */
export function OwnerMenu({ name, image }: { name: string; image: string | null }) {
  const [open, setOpen] = useState(false);
  const [imageFailed, setImageFailed] = useState(false);
  const container = useDismiss(open, setOpen);

  async function signOut() {
    await authClient.signOut();
    window.location.assign(signInPath);
  }

  return (
    <div ref={container} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-label={m.owner_signed_in_name({ name })}
        title={m.owner_signed_in_name({ name })}
        className="block rounded-full focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-900"
      >
        {image && !imageFailed ? (
          <img
            src={image}
            alt=""
            width={36}
            height={36}
            referrerPolicy="no-referrer"
            onError={() => setImageFailed(true)}
            className="size-9 rounded-full bg-neutral-200 object-cover ring-1 ring-black/5"
          />
        ) : (
          <span className="grid size-9 place-items-center rounded-full bg-neutral-200 text-xs font-medium text-neutral-700 select-none">
            {initials(name)}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 z-30 mt-2 w-56 rounded-xl border border-neutral-200 bg-white p-1.5 shadow-lg shadow-black/10">
          <LanguageControl />
          <div className="px-2.5 pt-1.5 pb-2">
            <p className="text-sm text-neutral-700">{m.owner_signed_in_name({ name })}</p>
          </div>
          {/* Phones only; from md up the header links to it. */}
          <Link to="/type-pairings" onClick={() => setOpen(false)} className={`${itemClassName} md:hidden`}>
            <Type aria-hidden className="size-4 text-neutral-500" strokeWidth={1.75} />
            {m.type_pairings_title()}</Link>
          {/* The header shows Brand Kits from md up; on phones it lives here. */}
          <Link to="/brand-kits" onClick={() => setOpen(false)} className={`${itemClassName} md:hidden`}>
            <Palette aria-hidden className="size-4 text-neutral-500" strokeWidth={1.75} />
            {m.brand_kits_title()}</Link>
          <Link to="/settings" onClick={() => setOpen(false)} className={itemClassName}>
            <Settings aria-hidden className="size-4 text-neutral-500" strokeWidth={1.75} />
            {m.settings_title()}</Link>
          <button type="button" onClick={signOut} className={itemClassName}>
            <LogOut aria-hidden className="size-4 text-neutral-500" strokeWidth={1.75} />
            {m.action_sign_out()}</button>
        </div>
      )}
    </div>
  );
}

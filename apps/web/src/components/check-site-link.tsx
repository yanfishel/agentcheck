"use client";

import { Zap } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * "Check a site" in the header: the way back to the start form from any page
 * but the landing, whose hero already holds the form. Centred in the header
 * from `sm` (the header row is its positioned ancestor); on a phone an icon
 * button at the head of the nav, the label kept for screen readers.
 */
export function CheckSiteLink({ className }: { className: string }) {
	const pathname = usePathname();
	if (pathname === "/") return null;
	return (
		<Link href="/#start" className={className}>
			<Zap aria-hidden="true" className="size-4" />
			<span className="sr-only sm:not-sr-only">Check a site</span>
		</Link>
	);
}

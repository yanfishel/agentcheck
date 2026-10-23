import { ClerkProvider } from "@clerk/nextjs";
import type { Metadata } from "next";
import { JetBrains_Mono, Schibsted_Grotesk } from "next/font/google";
import { SiteFooter } from "../components/site-footer";
import { SiteHeader } from "../components/site-header";
import { themeScript } from "../components/theme";
import { ToastProvider, TooltipProvider } from "../components/ui";
import { siteMetadata } from "../content/site";
import "./globals.css";

const schibsted = Schibsted_Grotesk({
	variable: "--font-schibsted",
	subsets: ["latin"],
});

const jetbrains = JetBrains_Mono({
	variable: "--font-jetbrains",
	subsets: ["latin"],
});

export const metadata: Metadata = siteMetadata;

export default function RootLayout({ children }: LayoutProps<"/">) {
	return (
		<html
			lang="en"
			data-scroll-behavior="smooth"
			className={`${schibsted.variable} ${jetbrains.variable} h-full antialiased`}
			// themeScript sets data-theme before hydration.
			suppressHydrationWarning
		>
			<head>
				{/* Agents that land on any page find the site's llms.txt. */}
				<link rel="describedby" href="/llms.txt" />
				<script
					// biome-ignore lint/security/noDangerouslySetInnerHtml: a constant script with no user input.
					dangerouslySetInnerHTML={{ __html: themeScript }}
				/>
			</head>
			<body className="min-h-full flex flex-col">
				{/* Our tokens, so Clerk's modals follow the site theme (light, dark or system). */}
				<ClerkProvider
					// Clerk's own theme follows the page's color-scheme (light/dark).
					// Ours: the logo, the brand colour (the dashboard's colours reach
					// only Clerk's hosted pages; a plain hex, since Clerk derives its
					// button shades from it and a CSS variable leaves them empty), the
					// type and the corner radius.
					appearance={{
						// The mark on its plum tile reads on Clerk's light and dark modal.
						options: { logoImageUrl: "/brand/agentcheck-icon-512.png" },
						variables: {
							colorPrimary: "#6e2a5e",
							colorPrimaryForeground: "#ffffff",
							borderRadius: "14px",
							fontFamily: "var(--font-schibsted), system-ui, sans-serif",
						},
					}}
				>
					<TooltipProvider>
						<SiteHeader />
						<ToastProvider>
							{/* Grows so the footer sits at the bottom of short pages. */}
							<div className="flex flex-1 flex-col">{children}</div>
						</ToastProvider>
						<SiteFooter />
					</TooltipProvider>
				</ClerkProvider>
			</body>
		</html>
	);
}

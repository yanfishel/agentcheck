import { HeroBackdrop } from "./hero-backdrop";

/** The plum hero; it continues the band header, and the start form floats on its lower edge. */
export function Hero() {
	return (
		<section className="on-band relative isolate overflow-hidden bg-accent px-4 pt-12 pb-20 text-center text-accent-fg sm:pt-20 sm:pb-24">
			<HeroBackdrop />
			<h1 className="mx-auto max-w-[18ch] text-4xl font-bold leading-[1.05] tracking-tight text-balance sm:text-6xl">
				Is your site ready for AI agents?
			</h1>
			<p className="mx-auto mt-6 max-w-[52ch] sm:mt-8 md:max-w-3xl text-lg text-accent-fg/85 text-balance">
				People ask ChatGPT, Claude and Perplexity what they used to google.
				Check whether those assistants can read your site, quote it and link to
				it. It takes under a minute.
			</p>
		</section>
	);
}

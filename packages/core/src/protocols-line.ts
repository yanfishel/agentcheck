/**
 * The closing line of a protocols section, shared by the reporters and the
 * web report. A plain module (no network imports), so client code can use it.
 */
export function protocolsLine(checked: number, found: number): string {
	if (found === 0) return `Checked ${checked} protocols, none published.`;
	return `Checked ${checked} protocols, ${found} published.`;
}

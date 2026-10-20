/** A robot face, the start form's field icon; drawn outside lucide-react like the GitHub mark. */
export function RobotIcon({ className = "" }: { className?: string }) {
	return (
		<svg
			xmlns="http://www.w3.org/2000/svg"
			viewBox="0 0 24 24"
			className={className}
			aria-hidden="true"
		>
			<g fill="none">
				<rect
					width="16.4"
					height="12.76"
					x="3.8"
					y="7.11"
					fill="currentColor"
					opacity=".2"
					rx="3"
				/>
				<path
					stroke="currentColor"
					strokeLinecap="round"
					strokeLinejoin="round"
					strokeWidth="1.5"
					d="M9.3 11.48v2.64m5.65-2.64v2.64m5.25-.39h2.12m-20.65 0H3.8m8.5-6.62c0-1.35 0-2.03-.32-2.52a2 2 0 0 0-.61-.6c-.5-.32-1.17-.32-2.52-.32h-.21"
				/>
				<rect
					width="16.4"
					height="12.76"
					x="3.8"
					y="7.11"
					stroke="currentColor"
					strokeLinecap="round"
					strokeLinejoin="round"
					strokeWidth="1.5"
					rx="3"
				/>
			</g>
		</svg>
	);
}

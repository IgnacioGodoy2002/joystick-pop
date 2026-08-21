const LANGUAGES: { lang: string; colorClass: string }[] = [
	{ lang: 'es', colorClass: 'language-chip-yellow' },
	{ lang: 'en', colorClass: 'language-chip-green' },
	{ lang: 'pt', colorClass: 'language-chip-blue' }
]

const languageChips = (activeLang: string) => {
	return (
		<div class="language-chip-row">
			{ LANGUAGES.map(({ lang, colorClass }) => {
				const stateClass = lang === activeLang ? 'language-chip-active' : 'language-chip-inactive'
				return (
					<div class={`language-chip ${colorClass} ${stateClass}`} data-lang={lang}>
						{ lang.toUpperCase() }
					</div>
				)
			}) }
		</div>
	)
}

export default languageChips

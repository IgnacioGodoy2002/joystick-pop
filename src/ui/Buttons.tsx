const button = (text: string) => {
	return (
		<button class="button is-large game-button">
			{ text }
		</button>
	)
}

const primaryButton = (text: string) => {
	return (
		<button class="button is-primary is-large game-button">
			{ text }
		</button>
	)
}

const successButton = (text: string) => {
	return (
		<button class="button is-success is-large game-button">
			{ text }
		</button>
	)
}

const infoButton = (text: string) => {
	return (
		<button class="button is-info is-large game-button">
			{ text }
		</button>
	)
}

const warningButton = (text: string) => {
	return (
		<button class="button is-warning is-large game-button">
			{ text }
		</button>
	)
}

const dangerButton = (text: string) => {
	return (
		<button class="button is-danger is-large game-button">
			{ text }
		</button>
	)
}

export default button

export {
	primaryButton,
	successButton,
	infoButton,
	warningButton,
	dangerButton
}

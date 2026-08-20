// botón secundario exclusivo del menú principal (estilo esférico) — separado
// del button() genérico de Buttons.tsx para no afectar Pause/HowToPlay/GameOver
const menuSecondaryButton = (text: string) => {
	return (
		<button class="button is-large game-button sphere-button">
			{ text }
		</button>
	)
}

export default menuSecondaryButton

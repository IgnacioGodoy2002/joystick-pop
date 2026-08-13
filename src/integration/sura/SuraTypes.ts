/**
 * Envelope y catálogo de mensajes del contrato canónico de integración SURA.
 * Ver MINIGAME_INTEGRATION_CONTRACT.md, secciones 3 y 4.
 */

const SURA_MSG = {
	// Host -> Game
	INIT: 'SURA_MINIGAME_INIT',
	PAUSE: 'SURA_MINIGAME_PAUSE',
	RESUME: 'SURA_MINIGAME_RESUME',

	// Game -> Host
	READY: 'MINIGAME_READY',
	SESSION_ACCEPTED: 'MINIGAME_SESSION_ACCEPTED',
	STARTED: 'MINIGAME_STARTED',
	COMPLETED: 'MINIGAME_COMPLETED',
	ERROR: 'MINIGAME_ERROR',
	EXIT_REQUESTED: 'MINIGAME_EXIT_REQUESTED'
} as const

type SuraMsgType = typeof SURA_MSG[keyof typeof SURA_MSG]

type SuraEnvelope = {
	source: 'sura-minigames'
	version: 1
	type: SuraMsgType
	payload: Record<string, unknown>
}

// Host -> Game payloads

interface SuraMinigameInitPayload
{
	token: string
	session_id: string
	player_id: string
	game_id: string
	nickname?: string
}

type SuraMinigamePausePayload = Record<string, never>

type SuraMinigameResumePayload = Record<string, never>

// Game -> Host payloads

interface MinigameReadyPayload
{
	game_id: string
	version: number
}

interface MinigameSessionAcceptedPayload
{
	session_id: string
	game_id: string
}

interface MinigameStartedPayload
{
	session_id: string
	game_id: string
}

interface MinigameCompletedPayload
{
	session_id: string
	game_id: string
	score: number
	stats?: Record<string, unknown>
}

interface MinigameErrorPayload
{
	session_id?: string
	message: string
}

type MinigameExitRequestedPayload = Record<string, never>

export {
	SURA_MSG,
	SuraMsgType,
	SuraEnvelope,

	SuraMinigameInitPayload,
	SuraMinigamePausePayload,
	SuraMinigameResumePayload,

	MinigameReadyPayload,
	MinigameSessionAcceptedPayload,
	MinigameStartedPayload,
	MinigameCompletedPayload,
	MinigameErrorPayload,
	MinigameExitRequestedPayload
}

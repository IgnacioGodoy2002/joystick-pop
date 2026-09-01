/**
 * Envelope y catálogo de mensajes del contrato REAL de integración SURA
 * (doc de Fede, 28/08/2026) -- confirmado bajando el bundle que sirve el
 * CDN de Sura. Reemplaza el contrato provisional anterior
 * (SURA_MINIGAME_INIT/MINIGAME_COMPLETED envueltos, snake_case, player_id
 * obligatorio), que nunca coincidió con lo que el host realmente manda.
 */

const SURA_MSG = {
	// Host -> Game
	INIT: 'INIT_GAME',
	PAUSE: 'SURA_MINIGAME_PAUSE',
	RESUME: 'SURA_MINIGAME_RESUME',

	// Game -> Host
	READY: 'MINIGAME_READY',
	SESSION_ACCEPTED: 'MINIGAME_SESSION_ACCEPTED',
	STARTED: 'MINIGAME_STARTED',
	COMPLETED: 'GAME_COMPLETE',
	ERROR: 'MINIGAME_ERROR',
	EXIT_REQUESTED: 'MINIGAME_EXIT_REQUESTED'
} as const

type SuraMsgType = typeof SURA_MSG[keyof typeof SURA_MSG]

// Solo los mensajes Host -> Game usan este sobre { type, payload }. El
// GAME_COMPLETE que manda el juego es plano (ver SuraBridge.sendCompletion).
type SuraEnvelope = {
	type: SuraMsgType
	payload: Record<string, unknown>
}

// Host -> Game payloads

interface SuraMinigameInitPayload
{
	token: string
	sessionId: string
	username?: string
	referral?: string
	referredByNickname?: string
	// Nuevos -- UUID real del minijuego y base de la API, para que un solo
	// build sirva en cualquier entorno sin hardcodear nada. Opcionales en el
	// tipo por si un host viejo todavía no los manda: el leaderboard
	// simplemente cae al listado local en ese caso (ver LeaderboardService.ts).
	gameId?: string
	apiBaseUrl?: string
	// El mejor puntaje real del jugador para este juego, calculado por
	// sura-api -- no el localStorage del juego, que es por dispositivo y
	// nunca se sincroniza con la cuenta.
	bestScore?: number
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

// GAME_COMPLETE es plano -- no va bajo `payload`, se manda tal cual junto a `type`.
interface GameCompletePayload
{
	sessionId: string
	score: number
	provider: string
	duration_ms?: number
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
	GameCompletePayload,
	MinigameErrorPayload,
	MinigameExitRequestedPayload
}

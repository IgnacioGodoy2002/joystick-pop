import i18next from 'i18next'
import LanguageDetector from 'i18next-browser-languagedetector'

import es from './es.json'
import en from './en.json'
import pt from './pt.json'

const USER_LANGUAGE_STORAGE_KEY = 'userLanguage'

const initI18n = () => {
	const savedLanguage = localStorage.getItem(USER_LANGUAGE_STORAGE_KEY)

	return i18next
		.use(LanguageDetector)
		.init({
			resources: {
				es: { translation: es },
				en: { translation: en },
				pt: { translation: pt }
			},
			fallbackLng: 'es',
			// si el usuario ya eligió un idioma a mano, respetarlo en vez de
			// volver a detectar por navigator.language
			...(savedLanguage ? { lng: savedLanguage } : {}),
			detection: {
				order: ['navigator'],
				caches: []
			}
		})
}

export default initI18n

export {
	i18next,
	USER_LANGUAGE_STORAGE_KEY
}

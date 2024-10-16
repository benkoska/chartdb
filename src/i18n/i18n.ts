import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { en, enMetadata } from './locales/en';
import { de } from './locales/de';

const resources = {
    en,
    de,
};

i18n.use(initReactI18next).init({
    resources,
    lng: enMetadata.code,
    interpolation: {
        escapeValue: false,
    },
    fallbackLng: enMetadata.code,
    debug: false,
});

export { i18n };

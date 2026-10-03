// Translations are registered at runtime instead of being added to
// src/i18n/locales/* so this fork-only feature does not conflict with
// upstream locale changes. Missing languages fall back to English.
import { i18n } from '@/i18n/i18n';

const translations = {
    en: {
        relationship_tools: {
            tools: {
                one_to_one_non_identifying: 'Non-identifying relationship 1:1',
                one_to_many_non_identifying: 'Non-identifying relationship 1:n',
                one_to_one_identifying: 'Identifying relationship 1:1',
                one_to_many_identifying: 'Identifying relationship 1:n',
                many_to_many: 'Relationship n:m (creates a junction table)',
            },
            hint: {
                pick_child: 'Click the table that will get the foreign key',
                pick_parent: 'Click the table it will reference',
                pick_first: 'Click the first table',
                pick_second: 'Click the second table',
                cancel: 'Esc to cancel',
            },
            errors: {
                title: 'Cannot create relationship',
                no_primary_key: 'Table "{{tableName}}" has no primary key',
                view_not_supported:
                    '"{{tableName}}" is a view. Relationships can only connect tables',
                same_table: 'Pick two different tables',
                failed: 'Failed to create relationship',
            },
        },
    },
    ru: {
        relationship_tools: {
            tools: {
                one_to_one_non_identifying: 'Неидентифицирующая связь 1:1',
                one_to_many_non_identifying: 'Неидентифицирующая связь 1:n',
                one_to_one_identifying: 'Идентифицирующая связь 1:1',
                one_to_many_identifying: 'Идентифицирующая связь 1:n',
                many_to_many: 'Связь n:m (создаёт промежуточную таблицу)',
            },
            hint: {
                pick_child: 'Выберите таблицу, которая получит внешний ключ',
                pick_parent: 'Выберите таблицу, на которую он будет ссылаться',
                pick_first: 'Выберите первую таблицу',
                pick_second: 'Выберите вторую таблицу',
                cancel: 'Esc — отмена',
            },
            errors: {
                title: 'Не удалось создать связь',
                no_primary_key:
                    'У таблицы «{{tableName}}» нет первичного ключа',
                view_not_supported:
                    '«{{tableName}}» — это представление. Связи можно создавать только между таблицами',
                same_table: 'Выберите две разные таблицы',
                failed: 'Ошибка при создании связи',
            },
        },
    },
    uk: {
        relationship_tools: {
            tools: {
                one_to_one_non_identifying: 'Неідентифікуючий зв’язок 1:1',
                one_to_many_non_identifying: 'Неідентифікуючий зв’язок 1:n',
                one_to_one_identifying: 'Ідентифікуючий зв’язок 1:1',
                one_to_many_identifying: 'Ідентифікуючий зв’язок 1:n',
                many_to_many: 'Зв’язок n:m (створює проміжну таблицю)',
            },
            hint: {
                pick_child: 'Виберіть таблицю, яка отримає зовнішній ключ',
                pick_parent: 'Виберіть таблицю, на яку він посилатиметься',
                pick_first: 'Виберіть першу таблицю',
                pick_second: 'Виберіть другу таблицю',
                cancel: 'Esc — скасувати',
            },
            errors: {
                title: 'Не вдалося створити зв’язок',
                no_primary_key:
                    'Таблиця «{{tableName}}» не має первинного ключа',
                view_not_supported:
                    '«{{tableName}}» — це представлення. Зв’язки можна створювати лише між таблицями',
                same_table: 'Виберіть дві різні таблиці',
                failed: 'Помилка під час створення зв’язку',
            },
        },
    },
};

Object.entries(translations).forEach(([language, translation]) => {
    i18n.addResourceBundle(language, 'translation', translation, true, false);
});

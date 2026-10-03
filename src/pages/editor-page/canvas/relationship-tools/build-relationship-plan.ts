import type { DBTable } from '@/lib/domain/db-table';
import {
    calcTableHeight,
    getTableDimensions,
    MIN_TABLE_SIZE,
} from '@/lib/domain/db-table';
import type { DBField } from '@/lib/domain/db-field';
import type { DBIndex } from '@/lib/domain/db-index';
import { getTableIndexesWithPrimaryKey } from '@/lib/domain/db-index';
import type { DBRelationship } from '@/lib/domain/db-relationship';
import type { DatabaseType } from '@/lib/domain/database-type';
import { areFieldTypesCompatible } from '@/lib/data/data-types/data-types';
import { defaultTableColor } from '@/lib/colors';
import { generateId } from '@/lib/utils';
import type { RelationshipToolDefinition } from './relationship-tool-types';

export type RelationshipPlan =
    | {
          kind: 'foreign_key';
          childTableId: string;
          childTablePatch: Pick<DBTable, 'fields' | 'indexes'>;
          relationships: DBRelationship[];
      }
    | {
          kind: 'junction_table';
          junctionTable: DBTable;
          relationships: DBRelationship[];
      };

export type RelationshipPlanError =
    | { code: 'same_table' }
    | { code: 'view_not_supported'; tableName: string }
    | { code: 'no_primary_key'; tableName: string };

export type RelationshipPlanResult =
    | { plan: RelationshipPlan; error?: undefined }
    | { plan?: undefined; error: RelationshipPlanError };

export interface BuildRelationshipPlanParams {
    tool: RelationshipToolDefinition;
    // For 1:1 / 1:n tools the first picked table receives the foreign key
    // and the second one is referenced (MySQL Workbench order).
    firstTable: DBTable;
    secondTable: DBTable;
    tables: DBTable[];
    relationships: DBRelationship[];
    databaseType: DatabaseType;
}

const makeUniqueName = (baseName: string, takenNames: Set<string>) => {
    let name = baseName;
    let suffix = 1;
    while (takenNames.has(name.toLowerCase())) {
        name = `${baseName}${suffix++}`;
    }
    takenNames.add(name.toLowerCase());
    return name;
};

export const getForeignKeyFieldName = (
    parentTable: DBTable,
    primaryKeyField: DBField
) =>
    primaryKeyField.name.toLowerCase() === 'id'
        ? `${parentTable.name}_${primaryKeyField.name}`
        : primaryKeyField.name;

const createForeignKeyField = ({
    name,
    primaryKeyField,
    identifying,
    unique,
}: {
    name: string;
    primaryKeyField: DBField;
    identifying: boolean;
    unique: boolean;
}): DBField => ({
    id: generateId(),
    name,
    type: primaryKeyField.type,
    characterMaximumLength: primaryKeyField.characterMaximumLength,
    precision: primaryKeyField.precision,
    scale: primaryKeyField.scale,
    primaryKey: identifying,
    unique,
    nullable: false,
    createdAt: Date.now(),
});

const createRelationshipEntity = ({
    parentTable,
    primaryKeyField,
    childTable,
    foreignKeyField,
    oneToOne,
    name,
}: {
    parentTable: DBTable;
    primaryKeyField: DBField;
    childTable: DBTable;
    foreignKeyField: DBField;
    oneToOne: boolean;
    name: string;
}): DBRelationship => ({
    id: generateId(),
    name,
    sourceSchema: parentTable.schema,
    sourceTableId: parentTable.id,
    sourceFieldId: primaryKeyField.id,
    targetSchema: childTable.schema,
    targetTableId: childTable.id,
    targetFieldId: foreignKeyField.id,
    sourceCardinality: 'one',
    targetCardinality: oneToOne ? 'one' : 'many',
    createdAt: Date.now(),
});

// Adds FK columns referencing every PK column of parentTable to childFields.
// When allowed, a same-named compatible column that is not an FK yet is reused.
const addForeignKeyFields = ({
    parentTable,
    childTableId,
    childFields,
    identifying,
    oneToOne,
    relationships,
    databaseType,
    reuseExistingFields,
}: {
    parentTable: DBTable;
    childTableId: string;
    childFields: DBField[];
    identifying: boolean;
    oneToOne: boolean;
    relationships: DBRelationship[];
    databaseType: DatabaseType;
    reuseExistingFields: boolean;
}): {
    fields: DBField[];
    links: { primaryKeyField: DBField; foreignKeyField: DBField }[];
} => {
    const primaryKeyFields = parentTable.fields.filter((f) => f.primaryKey);
    const singleColumnUnique =
        oneToOne && !identifying && primaryKeyFields.length === 1;
    const takenNames = new Set(childFields.map((f) => f.name.toLowerCase()));
    const foreignKeyFieldIds = new Set(
        relationships
            .filter((r) => r.targetTableId === childTableId)
            .map((r) => r.targetFieldId)
    );

    let fields = [...childFields];
    const links: { primaryKeyField: DBField; foreignKeyField: DBField }[] = [];

    for (const primaryKeyField of primaryKeyFields) {
        const baseName = getForeignKeyFieldName(parentTable, primaryKeyField);
        const existingField = fields.find(
            (f) =>
                reuseExistingFields &&
                f.name.toLowerCase() === baseName.toLowerCase() &&
                !foreignKeyFieldIds.has(f.id) &&
                areFieldTypesCompatible(
                    primaryKeyField.type,
                    f.type,
                    databaseType
                )
        );

        if (existingField) {
            const reusedField: DBField = {
                ...existingField,
                primaryKey: existingField.primaryKey || identifying,
                nullable: false,
                unique: existingField.unique || singleColumnUnique,
            };
            fields = fields.map((f) =>
                f.id === reusedField.id ? reusedField : f
            );
            foreignKeyFieldIds.add(reusedField.id);
            links.push({ primaryKeyField, foreignKeyField: reusedField });
            continue;
        }

        const foreignKeyField = createForeignKeyField({
            name: makeUniqueName(baseName, takenNames),
            primaryKeyField,
            identifying,
            unique: singleColumnUnique,
        });
        fields.push(foreignKeyField);
        links.push({ primaryKeyField, foreignKeyField });
    }

    return { fields, links };
};

interface Rect {
    x: number;
    y: number;
    width: number;
    height: number;
}

const TABLE_GAP = 40;
const POSITION_SEARCH_STEP = 20;
const POSITION_SEARCH_ATTEMPTS = 100;

const rectsOverlap = (a: Rect, b: Rect) =>
    a.x < b.x + b.width + TABLE_GAP &&
    a.x + a.width + TABLE_GAP > b.x &&
    a.y < b.y + b.height + TABLE_GAP &&
    a.y + a.height + TABLE_GAP > b.y;

// Moves rect up/down from its preferred spot until it does not overlap tables
const findFreePosition = (rect: Rect, tables: DBTable[]): Rect => {
    const occupied = tables.map((t) => ({
        x: t.x,
        y: t.y,
        ...getTableDimensions(t),
    }));

    for (let attempt = 0; attempt < POSITION_SEARCH_ATTEMPTS; attempt++) {
        const direction = attempt % 2 === 0 ? 1 : -1;
        const candidate = {
            ...rect,
            y:
                rect.y +
                direction * Math.ceil(attempt / 2) * POSITION_SEARCH_STEP,
        };
        if (!occupied.some((o) => rectsOverlap(candidate, o))) {
            return candidate;
        }
    }

    return rect;
};

const findView = (...tables: DBTable[]) => tables.find((t) => t.isView);

const findTableWithoutPrimaryKey = (...tables: DBTable[]) =>
    tables.find((t) => !t.fields.some((f) => f.primaryKey));

export const buildRelationshipPlan = ({
    tool,
    firstTable,
    secondTable,
    tables,
    relationships,
    databaseType,
}: BuildRelationshipPlanParams): RelationshipPlanResult => {
    const takenRelationshipNames = new Set(
        relationships.map((r) => r.name.toLowerCase())
    );

    if (tool.manyToMany) {
        return buildJunctionTablePlan({
            firstTable,
            secondTable,
            tables,
            relationships,
            databaseType,
            takenRelationshipNames,
        });
    }

    const childTable = firstTable;
    const parentTable = secondTable;

    if (childTable.id === parentTable.id) {
        return { error: { code: 'same_table' } };
    }

    const view = findView(childTable, parentTable);
    if (view) {
        return { error: { code: 'view_not_supported', tableName: view.name } };
    }

    if (findTableWithoutPrimaryKey(parentTable)) {
        return {
            error: { code: 'no_primary_key', tableName: parentTable.name },
        };
    }

    const { fields, links } = addForeignKeyFields({
        parentTable,
        childTableId: childTable.id,
        childFields: childTable.fields,
        identifying: tool.identifying,
        oneToOne: tool.oneToOne,
        relationships,
        databaseType,
        reuseExistingFields: true,
    });

    let indexes: DBIndex[] = getTableIndexesWithPrimaryKey({
        table: { ...childTable, fields },
    });

    // Composite FK of a non-identifying 1:1 needs a composite unique index
    if (tool.oneToOne && !tool.identifying && links.length > 1) {
        indexes = [
            ...indexes,
            {
                id: generateId(),
                name: makeUniqueName(
                    `${childTable.name}_${parentTable.name}_unique`,
                    new Set(indexes.map((i) => i.name.toLowerCase()))
                ),
                unique: true,
                fieldIds: links.map((l) => l.foreignKeyField.id),
                createdAt: Date.now(),
            },
        ];
    }

    const relationshipBaseName = `fk_${childTable.name}_${parentTable.name}`;
    const newRelationships = links.map(({ primaryKeyField, foreignKeyField }) =>
        createRelationshipEntity({
            parentTable,
            primaryKeyField,
            childTable,
            foreignKeyField,
            oneToOne: tool.oneToOne,
            name: makeUniqueName(relationshipBaseName, takenRelationshipNames),
        })
    );

    return {
        plan: {
            kind: 'foreign_key',
            childTableId: childTable.id,
            childTablePatch: { fields, indexes },
            relationships: newRelationships,
        },
    };
};

const buildJunctionTablePlan = ({
    firstTable,
    secondTable,
    tables,
    relationships,
    databaseType,
    takenRelationshipNames,
}: Omit<BuildRelationshipPlanParams, 'tool'> & {
    takenRelationshipNames: Set<string>;
}): RelationshipPlanResult => {
    const view = findView(firstTable, secondTable);
    if (view) {
        return { error: { code: 'view_not_supported', tableName: view.name } };
    }

    const tableWithoutPrimaryKey = findTableWithoutPrimaryKey(
        firstTable,
        secondTable
    );
    if (tableWithoutPrimaryKey) {
        return {
            error: {
                code: 'no_primary_key',
                tableName: tableWithoutPrimaryKey.name,
            },
        };
    }

    const schema = firstTable.schema;
    const junctionName = makeUniqueName(
        `${firstTable.name}_has_${secondTable.name}`,
        new Set(
            tables
                .filter((t) => (t.schema ?? null) === (schema ?? null))
                .map((t) => t.name.toLowerCase())
        )
    );
    const junctionId = generateId();

    const first = addForeignKeyFields({
        parentTable: firstTable,
        childTableId: junctionId,
        childFields: [],
        identifying: true,
        oneToOne: false,
        relationships,
        databaseType,
        reuseExistingFields: false,
    });
    const second = addForeignKeyFields({
        parentTable: secondTable,
        childTableId: junctionId,
        childFields: first.fields,
        identifying: true,
        oneToOne: false,
        relationships,
        databaseType,
        reuseExistingFields: false,
    });

    const junctionTable: DBTable = {
        id: junctionId,
        name: junctionName,
        schema,
        x: 0,
        y: 0,
        fields: second.fields,
        indexes: [],
        color: defaultTableColor,
        isView: false,
        createdAt: Date.now(),
        order: tables.length,
    };
    junctionTable.indexes = getTableIndexesWithPrimaryKey({
        table: junctionTable,
    });

    // Place the junction table between the two related tables
    const firstSize = getTableDimensions(firstTable);
    const secondSize = getTableDimensions(secondTable);
    const centerX =
        (firstTable.x +
            firstSize.width / 2 +
            secondTable.x +
            secondSize.width / 2) /
        2;
    const centerY =
        (firstTable.y +
            firstSize.height / 2 +
            secondTable.y +
            secondSize.height / 2) /
        2;
    const position = findFreePosition(
        {
            x: Math.round(centerX - MIN_TABLE_SIZE / 2),
            y: Math.round(centerY - calcTableHeight(junctionTable) / 2),
            width: MIN_TABLE_SIZE,
            height: calcTableHeight(junctionTable),
        },
        tables
    );
    junctionTable.x = position.x;
    junctionTable.y = position.y;

    const toRelationships = (
        parentTable: DBTable,
        links: { primaryKeyField: DBField; foreignKeyField: DBField }[]
    ) =>
        links.map(({ primaryKeyField, foreignKeyField }) =>
            createRelationshipEntity({
                parentTable,
                primaryKeyField,
                childTable: junctionTable,
                foreignKeyField,
                oneToOne: false,
                name: makeUniqueName(
                    `fk_${junctionName}_${parentTable.name}`,
                    takenRelationshipNames
                ),
            })
        );

    return {
        plan: {
            kind: 'junction_table',
            junctionTable,
            relationships: [
                ...toRelationships(firstTable, first.links),
                ...toRelationships(secondTable, second.links),
            ],
        },
    };
};

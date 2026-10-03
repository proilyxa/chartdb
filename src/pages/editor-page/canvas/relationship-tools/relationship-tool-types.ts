export type RelationshipToolType =
    | 'one_to_one_non_identifying'
    | 'one_to_many_non_identifying'
    | 'one_to_one_identifying'
    | 'one_to_many_identifying'
    | 'many_to_many';

export interface RelationshipToolDefinition {
    type: RelationshipToolType;
    label: '1:1' | '1:n' | 'n:m';
    // Identifying relationships make the FK columns part of the child's PK
    identifying: boolean;
    oneToOne: boolean;
    manyToMany: boolean;
}

// Same order as the MySQL Workbench relationship toolbar
export const relationshipTools: RelationshipToolDefinition[] = [
    {
        type: 'one_to_one_non_identifying',
        label: '1:1',
        identifying: false,
        oneToOne: true,
        manyToMany: false,
    },
    {
        type: 'one_to_many_non_identifying',
        label: '1:n',
        identifying: false,
        oneToOne: false,
        manyToMany: false,
    },
    {
        type: 'one_to_one_identifying',
        label: '1:1',
        identifying: true,
        oneToOne: true,
        manyToMany: false,
    },
    {
        type: 'one_to_many_identifying',
        label: '1:n',
        identifying: true,
        oneToOne: false,
        manyToMany: false,
    },
    {
        type: 'many_to_many',
        label: 'n:m',
        identifying: true,
        oneToOne: false,
        manyToMany: true,
    },
];

export const getRelationshipTool = (
    type: RelationshipToolType
): RelationshipToolDefinition =>
    relationshipTools.find((tool) => tool.type === type)!;

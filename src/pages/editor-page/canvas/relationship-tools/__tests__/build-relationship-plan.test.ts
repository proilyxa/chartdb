import { describe, it, expect } from 'vitest';
import type { DBTable } from '@/lib/domain/db-table';
import type { DBField } from '@/lib/domain/db-field';
import type { DBRelationship } from '@/lib/domain/db-relationship';
import { DatabaseType } from '@/lib/domain/database-type';
import { buildRelationshipPlan } from '../build-relationship-plan';
import type { RelationshipToolType } from '../relationship-tool-types';
import { getRelationshipTool } from '../relationship-tool-types';

const field = (overrides: Partial<DBField> & { name: string }): DBField => ({
    id: `${overrides.name}_id`,
    type: { id: 'bigint', name: 'bigint' },
    primaryKey: false,
    unique: false,
    nullable: true,
    createdAt: 0,
    ...overrides,
});

const table = (
    name: string,
    fields: DBField[] = [
        field({ id: `${name}.id`, name: 'id', primaryKey: true }),
    ],
    overrides: Partial<DBTable> = {}
): DBTable => ({
    id: name,
    name,
    schema: 'public',
    x: 0,
    y: 0,
    fields,
    indexes: [],
    color: '#fff',
    isView: false,
    createdAt: 0,
    ...overrides,
});

const plan = ({
    tool,
    firstTable,
    secondTable,
    tables = [firstTable, secondTable],
    relationships = [],
}: {
    tool: RelationshipToolType;
    firstTable: DBTable;
    secondTable: DBTable;
    tables?: DBTable[];
    relationships?: DBRelationship[];
}) =>
    buildRelationshipPlan({
        tool: getRelationshipTool(tool),
        firstTable,
        secondTable,
        tables,
        relationships,
        databaseType: DatabaseType.POSTGRESQL,
    });

describe('buildRelationshipPlan', () => {
    it('adds a NOT NULL foreign key column to the first table for 1:n non-identifying', () => {
        const users = table('users');
        const orders = table('orders');

        const { plan: result } = plan({
            tool: 'one_to_many_non_identifying',
            firstTable: orders,
            secondTable: users,
        });

        expect(result?.kind).toBe('foreign_key');
        if (result?.kind !== 'foreign_key') return;

        expect(result.childTableId).toBe('orders');
        const fk = result.childTablePatch.fields.find(
            (f) => f.name === 'users_id'
        );
        expect(fk).toMatchObject({
            type: { id: 'bigint', name: 'bigint' },
            primaryKey: false,
            nullable: false,
            unique: false,
        });

        expect(result.relationships).toHaveLength(1);
        expect(result.relationships[0]).toMatchObject({
            name: 'fk_orders_users',
            sourceTableId: 'users',
            sourceFieldId: 'users.id',
            targetTableId: 'orders',
            targetFieldId: fk?.id,
            sourceCardinality: 'one',
            targetCardinality: 'many',
        });
    });

    it('makes the foreign key unique for 1:1 non-identifying', () => {
        const { plan: result } = plan({
            tool: 'one_to_one_non_identifying',
            firstTable: table('profiles'),
            secondTable: table('users'),
        });

        if (result?.kind !== 'foreign_key') throw new Error('unexpected');
        const fk = result.childTablePatch.fields.find(
            (f) => f.name === 'users_id'
        );
        expect(fk?.unique).toBe(true);
        expect(result.relationships[0]).toMatchObject({
            sourceCardinality: 'one',
            targetCardinality: 'one',
        });
    });

    it('adds the foreign key to the primary key for identifying relationships', () => {
        const { plan: result } = plan({
            tool: 'one_to_many_identifying',
            firstTable: table('order_items'),
            secondTable: table('orders'),
        });

        if (result?.kind !== 'foreign_key') throw new Error('unexpected');
        const fk = result.childTablePatch.fields.find(
            (f) => f.name === 'orders_id'
        );
        expect(fk?.primaryKey).toBe(true);

        const pkIndex = result.childTablePatch.indexes.find(
            (i) => i.isPrimaryKey
        );
        expect(pkIndex?.fieldIds).toEqual(['order_items.id', fk?.id]);
    });

    it('reuses an existing compatible column with the expected name', () => {
        const orders = table('orders', [
            field({ id: 'orders.id', name: 'id', primaryKey: true }),
            field({ id: 'orders.user_id', name: 'users_id', nullable: true }),
        ]);

        const { plan: result } = plan({
            tool: 'one_to_many_non_identifying',
            firstTable: orders,
            secondTable: table('users'),
        });

        if (result?.kind !== 'foreign_key') throw new Error('unexpected');
        expect(result.childTablePatch.fields).toHaveLength(2);
        expect(result.relationships[0].targetFieldId).toBe('orders.user_id');
        expect(
            result.childTablePatch.fields.find((f) => f.id === 'orders.user_id')
                ?.nullable
        ).toBe(false);
    });

    it('creates a new column when the same-named column is already a foreign key', () => {
        const users = table('users');
        const orders = table('orders', [
            field({ id: 'orders.id', name: 'id', primaryKey: true }),
            field({ id: 'orders.users_id', name: 'users_id' }),
        ]);
        const existing: DBRelationship = {
            id: 'rel',
            name: 'fk_orders_users',
            sourceTableId: 'users',
            sourceFieldId: 'users.id',
            targetTableId: 'orders',
            targetFieldId: 'orders.users_id',
            sourceCardinality: 'one',
            targetCardinality: 'many',
            createdAt: 0,
        };

        const { plan: result } = plan({
            tool: 'one_to_many_non_identifying',
            firstTable: orders,
            secondTable: users,
            relationships: [existing],
        });

        if (result?.kind !== 'foreign_key') throw new Error('unexpected');
        expect(result.childTablePatch.fields.map((f) => f.name)).toEqual([
            'id',
            'users_id',
            'users_id1',
        ]);
        expect(result.relationships[0].name).toBe('fk_orders_users1');
    });

    it('references every column of a composite primary key', () => {
        const parent = table('order_items', [
            field({ id: 'oi.order_id', name: 'order_id', primaryKey: true }),
            field({ id: 'oi.line', name: 'line', primaryKey: true }),
        ]);

        const { plan: result } = plan({
            tool: 'one_to_one_non_identifying',
            firstTable: table('shipments'),
            secondTable: parent,
        });

        if (result?.kind !== 'foreign_key') throw new Error('unexpected');
        expect(result.relationships).toHaveLength(2);
        const fkNames = result.childTablePatch.fields.map((f) => f.name);
        expect(fkNames).toEqual(['id', 'order_id', 'line']);
        // Composite 1:1 is enforced with a composite unique index
        const uniqueIndex = result.childTablePatch.indexes.find(
            (i) => i.unique && !i.isPrimaryKey
        );
        expect(uniqueIndex?.fieldIds).toHaveLength(2);
    });

    it('creates a junction table for n:m', () => {
        const users = table('users', undefined, { x: 0, y: 0 });
        const roles = table('roles', undefined, { x: 1000, y: 0 });

        const { plan: result } = plan({
            tool: 'many_to_many',
            firstTable: users,
            secondTable: roles,
        });

        if (result?.kind !== 'junction_table') throw new Error('unexpected');
        const { junctionTable, relationships } = result;

        expect(junctionTable.name).toBe('users_has_roles');
        expect(junctionTable.schema).toBe('public');
        expect(junctionTable.fields.map((f) => f.name)).toEqual([
            'users_id',
            'roles_id',
        ]);
        expect(junctionTable.fields.every((f) => f.primaryKey)).toBe(true);
        expect(junctionTable.indexes[0]).toMatchObject({
            isPrimaryKey: true,
            fieldIds: junctionTable.fields.map((f) => f.id),
        });
        expect(junctionTable.x).toBeGreaterThan(users.x);
        expect(junctionTable.x).toBeLessThan(roles.x);

        expect(relationships).toHaveLength(2);
        expect(relationships[0]).toMatchObject({
            sourceTableId: 'users',
            targetTableId: junctionTable.id,
            sourceCardinality: 'one',
            targetCardinality: 'many',
        });
        expect(relationships[1]).toMatchObject({
            sourceTableId: 'roles',
            targetTableId: junctionTable.id,
        });
    });

    it('places the junction table where it does not overlap other tables', () => {
        const users = table('users', undefined, { x: 0, y: 0 });
        const orders = table('orders', undefined, { x: 400, y: 0 });
        const roles = table('roles', undefined, { x: 800, y: 0 });

        const { plan: result } = plan({
            tool: 'many_to_many',
            firstTable: users,
            secondTable: roles,
            tables: [users, orders, roles],
        });

        if (result?.kind !== 'junction_table') throw new Error('unexpected');
        const { junctionTable } = result;
        const ordersBottom = orders.y + 74; // header + one field
        const junctionBottom = junctionTable.y + 106; // header + two fields
        expect(
            junctionTable.y >= ordersBottom || junctionBottom <= orders.y
        ).toBe(true);
    });

    it('creates distinct columns for a self-referencing n:m', () => {
        const users = table('users');

        const { plan: result } = plan({
            tool: 'many_to_many',
            firstTable: users,
            secondTable: users,
            tables: [users, table('users_has_users', [])],
        });

        if (result?.kind !== 'junction_table') throw new Error('unexpected');
        expect(result.junctionTable.name).toBe('users_has_users1');
        expect(result.junctionTable.fields.map((f) => f.name)).toEqual([
            'users_id',
            'users_id1',
        ]);
    });

    it('fails when the referenced table has no primary key', () => {
        const { error } = plan({
            tool: 'one_to_many_non_identifying',
            firstTable: table('orders'),
            secondTable: table('logs', [field({ name: 'message' })]),
        });

        expect(error).toEqual({ code: 'no_primary_key', tableName: 'logs' });
    });

    it('fails for views and for the same table', () => {
        expect(
            plan({
                tool: 'one_to_many_non_identifying',
                firstTable: table('orders_view', undefined, { isView: true }),
                secondTable: table('users'),
            }).error
        ).toEqual({ code: 'view_not_supported', tableName: 'orders_view' });

        const users = table('users');
        expect(
            plan({
                tool: 'one_to_many_non_identifying',
                firstTable: users,
                secondTable: users,
            }).error
        ).toEqual({ code: 'same_table' });
    });
});

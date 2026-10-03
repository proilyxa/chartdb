import { useCallback } from 'react';
import { useChartDB } from '@/hooks/use-chartdb';
import { useRedoUndoStack } from '@/hooks/use-redo-undo-stack';
import { generateId } from '@/lib/utils';
import type { RelationshipPlan } from './build-relationship-plan';

// Applies a relationship plan as a single undo/redo step
export const useApplyRelationshipPlan = () => {
    const { getTable, updateTable, addTables, addRelationships } = useChartDB();
    const { addUndoAction, resetRedoStack } = useRedoUndoStack();

    return useCallback(
        async (plan: RelationshipPlan) => {
            const groupId = generateId();

            if (plan.kind === 'foreign_key') {
                const prevTable = getTable(plan.childTableId);
                if (!prevTable) {
                    return;
                }

                await updateTable(plan.childTableId, plan.childTablePatch, {
                    updateHistory: false,
                });
                addUndoAction({
                    action: 'updateTable',
                    redoData: {
                        tableId: plan.childTableId,
                        table: plan.childTablePatch,
                    },
                    undoData: {
                        tableId: plan.childTableId,
                        table: {
                            fields: prevTable.fields,
                            indexes: prevTable.indexes,
                        },
                    },
                    groupId,
                });
            } else {
                await addTables([plan.junctionTable], {
                    updateHistory: false,
                });
                addUndoAction({
                    action: 'addTables',
                    redoData: { tables: [plan.junctionTable] },
                    undoData: { tableIds: [plan.junctionTable.id] },
                    groupId,
                });
            }

            await addRelationships(plan.relationships, {
                updateHistory: false,
            });
            addUndoAction({
                action: 'addRelationships',
                redoData: { relationships: plan.relationships },
                undoData: {
                    relationshipIds: plan.relationships.map((r) => r.id),
                },
                groupId,
            });
            resetRedoStack();
        },
        [
            getTable,
            updateTable,
            addTables,
            addRelationships,
            addUndoAction,
            resetRedoStack,
        ]
    );
};

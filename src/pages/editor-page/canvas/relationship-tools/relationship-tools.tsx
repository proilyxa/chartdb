import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Separator } from '@/components/separator/separator';
import {
    Tooltip,
    TooltipContent,
    TooltipTrigger,
} from '@/components/tooltip/tooltip';
import { useToast } from '@/components/toast/use-toast';
import { useChartDB } from '@/hooks/use-chartdb';
import { useCanvas } from '@/hooks/use-canvas';
import { useBreakpoint } from '@/hooks/use-breakpoint';
import { cn } from '@/lib/utils';
import { ToolbarButton } from '../toolbar/toolbar-button';
import type { RelationshipToolType } from './relationship-tool-types';
import {
    getRelationshipTool,
    relationshipTools,
} from './relationship-tool-types';
import { RelationshipToolIcon } from './relationship-tool-icon';
import { buildRelationshipPlan } from './build-relationship-plan';
import type { RelationshipPlanError } from './build-relationship-plan';
import { useApplyRelationshipPlan } from './use-apply-relationship-plan';
import './relationship-tools-i18n';

const TABLE_NODE_SELECTOR = '.react-flow__node-table';

// MySQL Workbench style relationship tools rendered in the canvas toolbar:
// pick a tool, click the table that gets the foreign key, then the referenced
// table. n:m creates a junction table.
export const RelationshipTools: React.FC = () => {
    const { t } = useTranslation();
    const { toast } = useToast();
    const { tables, relationships, databaseType, getTable } = useChartDB();
    const {
        tempFloatingEdge,
        startFloatingEdgeCreation,
        endFloatingEdgeCreation,
        hideCreateRelationshipNode,
        setEditTableModeTable,
    } = useCanvas();
    const applyRelationshipPlan = useApplyRelationshipPlan();
    const { isMd: isDesktop } = useBreakpoint('md');
    const [activeToolType, setActiveToolType] =
        useState<RelationshipToolType | null>(null);

    const activeTool = activeToolType
        ? getRelationshipTool(activeToolType)
        : null;
    const pendingTableId = activeTool
        ? tempFloatingEdge?.sourceNodeId
        : undefined;

    const deactivateTool = useCallback(() => {
        setActiveToolType(null);
        endFloatingEdgeCreation();
    }, [endFloatingEdgeCreation]);

    const toggleTool = useCallback(
        (type: RelationshipToolType) => {
            if (activeToolType === type) {
                deactivateTool();
                return;
            }

            hideCreateRelationshipNode();
            setEditTableModeTable(null);
            setActiveToolType(type);
        },
        [
            activeToolType,
            deactivateTool,
            hideCreateRelationshipNode,
            setEditTableModeTable,
        ]
    );

    const showError = useCallback(
        (error: RelationshipPlanError | { code: 'failed' }) => {
            toast({
                title: t('relationship_tools.errors.title'),
                description: t(`relationship_tools.errors.${error.code}`, {
                    tableName: 'tableName' in error ? error.tableName : '',
                }),
                variant: 'destructive',
            });
        },
        [t, toast]
    );

    const handleTableClick = useCallback(
        async (tableId: string) => {
            if (!activeTool) {
                return;
            }

            if (!pendingTableId) {
                startFloatingEdgeCreation({ sourceNodeId: tableId });
                return;
            }

            // Clicking the first table again is most likely a misclick
            if (pendingTableId === tableId) {
                return;
            }

            const firstTable = getTable(pendingTableId);
            const secondTable = getTable(tableId);
            deactivateTool();

            if (!firstTable || !secondTable) {
                return;
            }

            const result = buildRelationshipPlan({
                tool: activeTool,
                firstTable,
                secondTable,
                tables,
                relationships,
                databaseType,
            });

            if (result.error) {
                showError(result.error);
                return;
            }

            try {
                await applyRelationshipPlan(result.plan);
            } catch (error) {
                console.error(error);
                showError({ code: 'failed' });
            }
        },
        [
            activeTool,
            pendingTableId,
            startFloatingEdgeCreation,
            getTable,
            deactivateTool,
            tables,
            relationships,
            databaseType,
            showError,
            applyRelationshipPlan,
        ]
    );

    // Table clicks are intercepted in the capture phase so the regular table
    // node handlers (selection, edit mode, create relationship popup) stay untouched
    useEffect(() => {
        if (!activeToolType) {
            return;
        }

        const handleClick = (event: MouseEvent) => {
            const nodeElement = (event.target as Element | null)?.closest?.(
                TABLE_NODE_SELECTOR
            ) as HTMLElement | null;
            const tableId = nodeElement?.dataset.id;

            if (!tableId) {
                return;
            }

            event.stopPropagation();
            event.preventDefault();
            handleTableClick(tableId);
        };

        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                deactivateTool();
            }
        };

        document.addEventListener('click', handleClick, true);
        document.addEventListener('dblclick', handleClick, true);
        document.addEventListener('keydown', handleKeyDown);
        return () => {
            document.removeEventListener('click', handleClick, true);
            document.removeEventListener('dblclick', handleClick, true);
            document.removeEventListener('keydown', handleKeyDown);
        };
    }, [activeToolType, handleTableClick, deactivateTool]);

    const hint = activeTool
        ? activeTool.manyToMany
            ? pendingTableId
                ? t('relationship_tools.hint.pick_second')
                : t('relationship_tools.hint.pick_first')
            : pendingTableId
              ? t('relationship_tools.hint.pick_parent')
              : t('relationship_tools.hint.pick_child')
        : null;

    if (!isDesktop) {
        return null;
    }

    return (
        <>
            <div className="relative flex h-full flex-row items-center">
                {relationshipTools.map((tool, index) => (
                    <React.Fragment key={tool.type}>
                        {index === 2 || index === 4 ? (
                            <Separator orientation="vertical" />
                        ) : null}
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <span>
                                    <ToolbarButton
                                        className={cn(
                                            'w-[44px] px-1 py-0 [&_svg]:h-3 [&_svg]:w-8',
                                            activeToolType === tool.type
                                                ? 'bg-pink-600 text-white hover:bg-pink-500 hover:text-white dark:hover:bg-pink-700'
                                                : ''
                                        )}
                                        onClick={() => toggleTool(tool.type)}
                                    >
                                        <RelationshipToolIcon tool={tool} />
                                    </ToolbarButton>
                                </span>
                            </TooltipTrigger>
                            <TooltipContent>
                                {t(`relationship_tools.tools.${tool.type}`)}
                            </TooltipContent>
                        </Tooltip>
                    </React.Fragment>
                ))}
                {hint ? (
                    <div className="pointer-events-none absolute bottom-full left-0 mb-3 flex items-center gap-2 whitespace-nowrap rounded-md bg-pink-600 px-3 py-1.5 text-xs font-medium text-white shadow-md">
                        <span>
                            {t(`relationship_tools.tools.${activeToolType}`)}
                        </span>
                        <span className="opacity-60">·</span>
                        <span>{hint}</span>
                        <span className="opacity-70">
                            ({t('relationship_tools.hint.cancel')})
                        </span>
                    </div>
                ) : null}
            </div>
            <Separator orientation="vertical" />
            {activeToolType ? (
                <style>{`
                    #canvas .react-flow__pane,
                    #canvas ${TABLE_NODE_SELECTOR},
                    #canvas ${TABLE_NODE_SELECTOR} * {
                        cursor: crosshair !important;
                    }
                `}</style>
            ) : null}
        </>
    );
};

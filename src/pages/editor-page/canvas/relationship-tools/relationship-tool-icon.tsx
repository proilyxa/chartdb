import React from 'react';
import type { RelationshipToolDefinition } from './relationship-tool-types';

export interface RelationshipToolIconProps {
    tool: RelationshipToolDefinition;
}

const CROW_FOOT_DEPTH = 8;

// Line notation from the MySQL Workbench toolbar: dashed = non-identifying,
// solid = identifying, crow's foot = "many" side
export const RelationshipToolIcon: React.FC<RelationshipToolIconProps> = ({
    tool,
}) => {
    const width = 32;
    const y = 6;
    const manyOnRight = !tool.oneToOne;
    const manyOnLeft = tool.manyToMany;

    return (
        <span className="flex flex-col items-center gap-0.5 leading-none">
            <svg
                width={width}
                height={12}
                viewBox={`0 0 ${width} 12`}
                fill="none"
                stroke="currentColor"
                strokeWidth={1.5}
                strokeLinecap="round"
                aria-hidden
            >
                <line
                    x1={1}
                    y1={y}
                    x2={width - 1}
                    y2={y}
                    strokeDasharray={tool.identifying ? undefined : '3 3'}
                />
                {manyOnRight ? (
                    <polyline
                        points={`${width - 1},1 ${width - 1 - CROW_FOOT_DEPTH},${y} ${width - 1},11`}
                    />
                ) : null}
                {manyOnLeft ? (
                    <polyline points={`1,1 ${1 + CROW_FOOT_DEPTH},${y} 1,11`} />
                ) : null}
            </svg>
            <span className="text-[10px] font-semibold">{tool.label}</span>
        </span>
    );
};

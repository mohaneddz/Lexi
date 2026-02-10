// StatsWidget component for dashboard

import { TrendingUp, BookOpen, Languages } from 'lucide-react';
import type { AppStats } from '@/types';

interface StatsWidgetProps {
    stats: AppStats;
}

export function StatsWidget({ stats }: StatsWidgetProps) {
    const statCards = [
        {
            icon: BookOpen,
            label: 'Words Learned',
            value: stats.totalWords,
            color: 'text-violet-400',
            bgColor: 'bg-violet-500/15',
        },
        {
            icon: Languages,
            label: 'Translations',
            value: stats.totalTranslations,
            color: 'text-blue-400',
            bgColor: 'bg-blue-500/15',
        },
        {
            icon: TrendingUp,
            label: 'Languages',
            value: stats.languagesTracked,
            color: 'text-emerald-400',
            bgColor: 'bg-emerald-500/15',
        },
    ];

    return (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 animate-slide-in-up">
            {statCards.map((stat, index) => {
                const Icon = stat.icon;
                return (
                    <div
                        key={index}
                        className="glass-card rounded-xl p-5 hover-lift"
                    >
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">
                                    {stat.label}
                                </p>
                                <h3 className="text-3xl font-bold text-foreground">
                                    {stat.value}
                                </h3>
                            </div>
                            <div className={`p-3 rounded-xl ${stat.bgColor}`}>
                                <Icon className={`h-6 w-6 ${stat.color}`} />
                            </div>
                        </div>
                    </div>
                );
            })}
        </div>
    );
}

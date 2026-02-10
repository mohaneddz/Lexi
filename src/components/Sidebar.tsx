// Navigation Sidebar for Lexi

import { Home, BookOpen, Languages, Settings, Moon, Sun } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import { useTheme } from '@/hooks/useTheme';
import { cn } from '@/lib/utils';

const navItems = [
    { path: '/', label: 'Dashboard', icon: Home },
    { path: '/words', label: 'Words', icon: BookOpen },
    { path: '/translations', label: 'Translations', icon: Languages },
    { path: '/settings', label: 'Settings', icon: Settings },
];

interface SidebarProps {
    isOpen: boolean;
    onClose: () => void;
}

export function Sidebar({ isOpen, onClose }: SidebarProps) {
    const location = useLocation();
    const { isDark, toggleTheme } = useTheme();

    return (
        <>
            {/* Overlay for mobile */}
            {isOpen && (
                <div 
                    className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 md:hidden"
                    onClick={onClose}
                />
            )}

            {/* Sidebar */}
            <aside 
                className={cn(
                    // Base styles
                    "w-64 shrink-0 flex flex-col p-4",
                    // Glass effect
                    "glass border-r border-glass-border",
                    // Mobile: fixed overlay
                    "fixed inset-y-0 left-0 z-50",
                    "transition-transform duration-300",
                    isOpen ? "translate-x-0" : "-translate-x-full",
                    // Desktop: static in layout
                    "md:relative md:translate-x-0"
                )}
            >
                {/* Logo & Header */}
                <div className="mb-8 px-2 flex justify-between items-start">
                    <div>
                        <h2 className="text-2xl font-bold bg-gradient-to-r from-primary to-purple-400 bg-clip-text text-transparent">
                            Lexi
                        </h2>
                        <p className="text-xs text-muted-foreground mt-1">AI Vocabulary Tracker</p>
                    </div>
                </div>

                {/* Navigation */}
                <nav className="flex-1 space-y-1">
                    {navItems.map((item) => {
                        const Icon = item.icon;
                        const isActive = location.pathname === item.path;

                        return (
                            <Link key={item.path} to={item.path} onClick={onClose}>
                                <div
                                    className={cn(
                                        'flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-200',
                                        'text-sm font-medium',
                                        isActive
                                            ? 'bg-primary/15 text-primary border border-primary/20'
                                            : 'text-muted-foreground hover:text-foreground hover:bg-white/5'
                                    )}
                                >
                                    <Icon className={cn("h-5 w-5", isActive && "text-primary")} />
                                    {item.label}
                                </div>
                            </Link>
                        );
                    })}
                </nav>

                {/* Theme Toggle */}
                <div className="pt-4 mt-4 border-t border-border/30">
                    <button
                        onClick={toggleTheme}
                        className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors"
                    >
                        {isDark ? (
                            <>
                                <Sun className="h-5 w-5" />
                                Light Mode
                            </>
                        ) : (
                            <>
                                <Moon className="h-5 w-5" />
                                Dark Mode
                            </>
                        )}
                    </button>
                </div>
            </aside>
        </>
    );
}

const POSTS: Record<string, { id: string; title: string; body: string; createdAt: string }[]> = {
    '1': [
        {
            id: 'p1',
            title: 'Acme Corp Product Launch',
            body: 'We are excited to announce our latest product line ahead of schedule.',
            createdAt: '2026-03-10',
        },
        {
            id: 'p2',
            title: 'Q1 Revenue Report',
            body: 'Revenue grew 34% quarter-over-quarter driven by enterprise sales.',
            createdAt: '2026-03-05',
        },
    ],
    '2': [
        {
            id: 'p3',
            title: 'Globex Expands to APAC',
            body: 'We are opening three new offices across Asia-Pacific this quarter.',
            createdAt: '2026-03-08',
        },
        {
            id: 'p4',
            title: 'New Engineering Hires',
            body: 'The platform team is growing — we just onboarded 12 senior engineers.',
            createdAt: '2026-03-01',
        },
    ],
    '3': [
        {
            id: 'p5',
            title: 'Weekly Sync Notes',
            body: 'TPS reports are due Friday. Please review the new cover sheet format.',
            createdAt: '2026-03-11',
        },
    ],
};

export default defineEventHandler((event) => {
    const tenant = useTenant(event);
    return POSTS[tenant.id] ?? [];
});

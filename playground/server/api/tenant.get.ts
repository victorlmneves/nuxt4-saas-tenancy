export default defineEventHandler(async () => {
    const tenant = useTenant();

    return { tenant };
});

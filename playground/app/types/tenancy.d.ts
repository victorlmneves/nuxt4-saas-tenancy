import type { Tenant as BaseTenant } from '../../../src/types'

declare module '../../../src/types' {
    interface Tenant {
        plan: 'free' | 'pro' | 'enterprise'
        brandColor: string
    }
}

export {}

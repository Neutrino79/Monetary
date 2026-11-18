/**
 * Sign-up, approval and the Admin API through the real services against the real backend: private
 * ledgers per account, temporary passwords, suspension and the audit trail. Runs after the files that
 * create the first account (the superuser) and its ledger data.
 */
import { describe, it, expect, beforeAll } from 'vitest'
import { useAuthStore } from '@/store/authStore'
import { queryClient } from '@/lib/queryClient'
import { authService } from '@/lib/api/services/authService'
import { accountsService } from '@/lib/api/services/accountsService'
import { adminService } from '@/lib/api/services/adminService'
import { tokenStorage } from '@/lib/api/tokenStorage'
import { OWNER } from './fixtures'

/*
 * The sign-in endpoint allows 10 attempts per 5 minutes per address and every attempt counts; the
 * earlier file already used 5. So this file signs in only 4 times and moves between accounts by
 * re-using the sessions it already holds.
 */
const NEWCOMER = { name: 'Ravi Kumar', email: 'ravi@example.com', password: 'ravi-password-1', answer: 'Pune' }  // pragma: allowlist secret
const ADMIN_PASSWORD = 'brand-new-pass-9'  // the owner's password at the end of 02-ledger-flows  // pragma: allowlist secret

const signIn = (email: string, password: string) => useAuthStore.getState().login(email, password)
async function useSession(token: string) {
  tokenStorage.set(token)
  await useAuthStore.getState().hydrate()
}
/** Drop the session in this browser only. (The store's logout() would also end it on the server.) */
const forget = () => useAuthStore.getState().finishPasswordChange()

let adminToken = ''
let raviToken = ''
let ravi = 0

beforeAll(async () => {
  queryClient.clear()
  forget()
})

describe('requesting an account', () => {
  it('is accepted, answers a repeated request or an existing email the same way, and signs nobody in', async () => {
    const input = {
      name: NEWCOMER.name, email: NEWCOMER.email, password: NEWCOMER.password, timezone: 'Asia/Kolkata',
      homeCurrencyCode: 'INR', securityQuestionId: 1, securityAnswer: NEWCOMER.answer,
    }
    await expect(authService.register(input)).resolves.toBeUndefined()
    await expect(authService.register(input)).resolves.toBeUndefined()
    await expect(authService.register({ ...input, email: OWNER.email })).resolves.toBeUndefined()
    expect(useAuthStore.getState().isAuthenticated).toBe(false)
  })
})

describe('approval and private ledgers', () => {
  it('lists the request for the administrator, who approves it', async () => {
    const account = await signIn(OWNER.email, ADMIN_PASSWORD)
    adminToken = tokenStorage.get()!
    expect(account.role).toBe('superuser')
    const pending = await adminService.listUsers({ status: 'pending_approval' })
    expect(pending.items.map((u) => u.email)).toEqual([NEWCOMER.email])
    ravi = pending.items[0].id
    expect((await adminService.stats()).pendingApproval).toBe(1)
    expect((await adminService.approve(ravi)).status).toBe('active')
    expect((await adminService.stats()).pendingApproval).toBe(0)
  })

  it('gives the approved user an empty ledger of their own, separate from the administrator\'s', async () => {
    const adminAccounts = await accountsService.list()
    expect(adminAccounts.length).toBeGreaterThan(0) // the earlier test files created accounts here

    forget()
    const account = await signIn(NEWCOMER.email, NEWCOMER.password)
    raviToken = tokenStorage.get()!
    expect(account.role).toBe('user')
    expect(useAuthStore.getState().user?.name).toBe(NEWCOMER.name)
    expect(await accountsService.list()).toEqual([])
    await expect(adminService.stats()).rejects.toMatchObject({ status: 403 }) // not an administrator
  })
})

describe('temporary passwords', () => {
  let sam = 0
  let samToken = ''

  it('creates an account whose first sign-in must replace the password', async () => {
    await useSession(adminToken)
    const issued = await adminService.createUser({ name: 'Sam', email: 'sam@example.com', homeCurrencyCode: 'INR', role: 'user' })
    sam = issued.user.id
    expect(issued.user.mustChangePassword).toBe(true)

    forget()
    const account = await signIn('sam@example.com', issued.temporaryPassword)
    expect(account.mustChangePassword).toBe(true)
    expect(useAuthStore.getState().user).toBeNull() // the ledger stays locked
    await expect(accountsService.list()).rejects.toMatchObject({ code: 'PasswordChangeRequired' })

    await authService.changePassword(issued.temporaryPassword, 'sam-own-password-1')  // pragma: allowlist secret
    forget() // the server ended every session when the password changed
    const after = await signIn('sam@example.com', 'sam-own-password-1')  // pragma: allowlist secret
    samToken = tokenStorage.get()!
    expect(after.mustChangePassword).toBe(false)
    expect(await accountsService.list()).toEqual([])
  })

  it('resetting a password signs the user out and issues a new temporary one', async () => {
    await useSession(adminToken)
    const reset = await adminService.resetPassword(sam)
    expect(reset.temporaryPassword.length).toBeGreaterThanOrEqual(12)
    expect((await adminService.listUsers({ q: 'sam@example.com' })).items[0].mustChangePassword).toBe(true)
    tokenStorage.set(samToken)
    await expect(accountsService.list()).rejects.toMatchObject({ status: 401 })
  })
})

describe('suspension, safety rules and the audit trail', () => {
  it('suspends an account at once and reactivates it', async () => {
    await useSession(adminToken)
    await adminService.suspend(ravi, 'testing')
    expect((await adminService.listUsers({ status: 'suspended' })).items.map((u) => u.id)).toEqual([ravi])
    tokenStorage.set(raviToken)
    await expect(accountsService.list()).rejects.toMatchObject({ status: 401 }) // signed out the moment it was suspended

    await useSession(adminToken)
    await adminService.reactivate(ravi)
    expect((await adminService.listUsers({ q: NEWCOMER.email })).items[0].status).toBe('active')
  })

  it('never lets the only superuser lock themselves out', async () => {
    await useSession(adminToken)
    const me = useAuthStore.getState().account!.id
    await expect(adminService.suspend(me)).rejects.toMatchObject({ status: 409 })
    await expect(adminService.remove(me)).rejects.toMatchObject({ status: 409 })
    await expect(adminService.setRole(me, 'user')).rejects.toMatchObject({ status: 409 })
  })

  it('records every action, newest first, with no passwords in it', async () => {
    await useSession(adminToken)
    const log = await adminService.auditLog({ limit: 100 })
    const actions = log.items.map((e) => e.action)
    expect(actions).toEqual(expect.arrayContaining(['user.approve', 'user.create', 'user.suspend', 'user.reactivate', 'user.reset_password']))
    expect(JSON.stringify(log)).not.toMatch(/password":"/)
    expect(log.items[0].action).toBe('user.reactivate')
  })
})

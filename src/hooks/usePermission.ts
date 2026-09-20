import { useMemo } from 'react';
import type { AuthUser } from '../types/promo';

export interface Permissions {
  /** Review/hapus pengajuan + CRUD katalog */
  canManage: boolean;
  /** Read-only: list pengajuan + export CSV + lihat katalog */
  isReadOnly: boolean;
  /** Kelola akun staf */
  canManageUsers: boolean;
  /** Semua role login: list/export */
  canExport: boolean;
  /** User role */
  role: string;
}

/**
 * usePermission - derives permissions dari role.
 * Role hierarchy: superadmin > admin > tenant_relation (read-only).
 */
export function usePermission(user: AuthUser | null): Permissions {
  return useMemo(() => {
    const role = user?.role || '';

    if (!role) {
      return {
        canManage: false,
        isReadOnly: false,
        canManageUsers: false,
        canExport: false,
        role: '',
      };
    }

    const isSuperadmin = role === 'superadmin';
    const isAdmin = role === 'admin' || isSuperadmin;
    const isTenantRelation = role === 'tenant_relation';

    return {
      canManage: isAdmin,
      isReadOnly: isTenantRelation,
      canManageUsers: isSuperadmin,
      canExport: true,
      role,
    };
  }, [user]);
}

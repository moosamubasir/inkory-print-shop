import React, { useEffect, useState } from 'react'
import {
  Plus,
  Pencil,
  Trash2,
  Eye,
  Send,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  X,
  Check,
  AlertCircle,
  FolderPlus,
} from 'lucide-react'

import { G, T } from './tokens'
import { Btn, Card, Input, Badge } from './ui'

// ─────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────

interface MenuItem {
  id: number
  categoryId: number
  name: string
  description: string | null
  price: number
  unit: string
  sortOrder: number
  isActive: boolean
}

interface MenuCategory {
  id: number
  name: string
  description: string | null
  sortOrder: number
  isActive: boolean
  items: MenuItem[]
}

interface MenuResponse {
  success: boolean
  publishedAt: string | null
  categories: MenuCategory[]
}


// ─────────────────────────────────────────────
// API BASE URL
// ─────────────────────────────────────────────

const API_BASE_URL = 'http://192.168.221.245:5000'


// ─────────────────────────────────────────────
// MENU MANAGER
// ─────────────────────────────────────────────

export function MenuManager() {

  const [categories, setCategories] = useState<MenuCategory[]>([])

  const [loading, setLoading] = useState(true)

  const [error, setError] = useState<string | null>(null)

  const [message, setMessage] = useState<string | null>(null)

  const [editingCategory, setEditingCategory] =
    useState<MenuCategory | null>(null)

  const [editingItem, setEditingItem] =
    useState<MenuItem | null>(null)

  const [categoryModalOpen, setCategoryModalOpen] =
    useState(false)

  const [itemModalOpen, setItemModalOpen] =
    useState(false)

  const [expandedCategories, setExpandedCategories] =
    useState<Record<number, boolean>>({})


  // ─────────────────────────────────────────────
  // LOAD MENU
  // ─────────────────────────────────────────────

  const loadMenu = async () => {

    try {

      setLoading(true)
      setError(null)

      const token = sessionStorage.getItem('pf_admin_token')

      const response = await fetch(
        `${API_BASE_URL}/api/admin/menu`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      )

      const data: MenuResponse = await response.json()

      if (!response.ok || !data.success) {
        throw new Error(
          (data as any).message ||
          'Unable to load menu.'
        )
      }

      setCategories(data.categories || [])

      // Expand all categories initially.
      const expanded: Record<number, boolean> = {}

      data.categories.forEach(category => {
        expanded[category.id] = true
      })

      setExpandedCategories(expanded)

    } catch (err) {

      console.error('Menu loading failed:', err)

      setError(
        err instanceof Error
          ? err.message
          : 'Unable to load menu.'
      )

    } finally {

      setLoading(false)

    }
  }


  useEffect(() => {
    loadMenu()
  }, [])


  // ─────────────────────────────────────────────
  // FLASH MESSAGE
  // ─────────────────────────────────────────────

  const flash = (text: string) => {

    setMessage(text)

    window.setTimeout(() => {
      setMessage(null)
    }, 2500)

  }


  // ─────────────────────────────────────────────
  // TOGGLE CATEGORY
  // ─────────────────────────────────────────────

  const toggleCategory = (id: number) => {

    setExpandedCategories(previous => ({
      ...previous,
      [id]: !previous[id],
    }))

  }


  // ─────────────────────────────────────────────
  // DELETE CATEGORY
  // ─────────────────────────────────────────────

  const deleteCategory = async (category: MenuCategory) => {

    const confirmed = window.confirm(
      `Delete "${category.name}" and all of its services?`
    )

    if (!confirmed) return

    try {

      const token = sessionStorage.getItem('pf_admin_token')

      const response = await fetch(
        `${API_BASE_URL}/api/admin/menu/categories/${category.id}`,
        {
          method: 'DELETE',

          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      )

      const data = await response.json()

      if (!response.ok || !data.success) {
        throw new Error(
          data.message || 'Unable to delete category.'
        )
      }

      flash('Category deleted.')

      await loadMenu()

    } catch (err) {

      console.error(err)

      setError(
        err instanceof Error
          ? err.message
          : 'Unable to delete category.'
      )

    }
  }


  // ─────────────────────────────────────────────
  // DELETE ITEM
  // ─────────────────────────────────────────────

  const deleteItem = async (item: MenuItem) => {

    const confirmed = window.confirm(
      `Delete "${item.name}"?`
    )

    if (!confirmed) return

    try {

      const token = sessionStorage.getItem('pf_admin_token')

      const response = await fetch(
        `${API_BASE_URL}/api/admin/menu/items/${item.id}`,
        {
          method: 'DELETE',

          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      )

      const data = await response.json()

      if (!response.ok || !data.success) {
        throw new Error(
          data.message || 'Unable to delete service.'
        )
      }

      flash('Service deleted.')

      await loadMenu()

    } catch (err) {

      console.error(err)

      setError(
        err instanceof Error
          ? err.message
          : 'Unable to delete service.'
      )

    }
  }


  // ─────────────────────────────────────────────
  // TOGGLE CATEGORY ACTIVE
  // ─────────────────────────────────────────────

  const toggleCategoryActive = async (
    category: MenuCategory
  ) => {

    try {

      const token = sessionStorage.getItem('pf_admin_token')

      const response = await fetch(
        `${API_BASE_URL}/api/admin/menu/categories/${category.id}`,
        {
          method: 'PATCH',

          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },

          body: JSON.stringify({
            isActive: !category.isActive,
          }),
        }
      )

      const data = await response.json()

      if (!response.ok || !data.success) {
        throw new Error(
          data.message || 'Unable to update category.'
        )
      }

      flash(
        category.isActive
          ? 'Category hidden from customers.'
          : 'Category enabled.'
      )

      await loadMenu()

    } catch (err) {

      console.error(err)

      setError(
        err instanceof Error
          ? err.message
          : 'Unable to update category.'
      )

    }
  }


  // ─────────────────────────────────────────────
  // TOGGLE ITEM ACTIVE
  // ─────────────────────────────────────────────

  const toggleItemActive = async (
    item: MenuItem
  ) => {

    try {

      const token = sessionStorage.getItem('pf_admin_token')

      const response = await fetch(
        `${API_BASE_URL}/api/admin/menu/items/${item.id}`,
        {
          method: 'PATCH',

          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },

          body: JSON.stringify({
            isActive: !item.isActive,
          }),
        }
      )

      const data = await response.json()

      if (!response.ok || !data.success) {
        throw new Error(
          data.message || 'Unable to update service.'
        )
      }

      flash(
        item.isActive
          ? 'Service hidden from customers.'
          : 'Service enabled.'
      )

      await loadMenu()

    } catch (err) {

      console.error(err)

      setError(
        err instanceof Error
          ? err.message
          : 'Unable to update service.'
      )

    }
  }


  // ─────────────────────────────────────────────
  // PUBLISH MENU
  // ─────────────────────────────────────────────

  const publishMenu = async () => {

    try {

      const token = sessionStorage.getItem('pf_admin_token')

      const response = await fetch(
        `${API_BASE_URL}/api/admin/menu/publish`,
        {
          method: 'POST',

          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      )

      const data = await response.json()

      if (!response.ok || !data.success) {
        throw new Error(
          data.message || 'Unable to publish menu.'
        )
      }

      flash('Menu published successfully.')

      await loadMenu()

    } catch (err) {

      console.error(err)

      setError(
        err instanceof Error
          ? err.message
          : 'Unable to publish menu.'
      )

    }
  }

  // ─────────────────────────────────────────────
  // LOADING
  // ─────────────────────────────────────────────

  if (loading) {

    return (
      <Card>

        <div
          style={{
            minHeight: 220,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 12,
          }}
        >

          <RefreshCw
            size={22}
            color={G.accent}
            style={{
              animation: 'spin 1s linear infinite',
            }}
          />

          <div
            style={{
              fontSize: 13,
              color: T.text.secondary,
            }}
          >
            Loading menu...
          </div>

        </div>

      </Card>
    )
  }


  // ─────────────────────────────────────────────
  // MAIN UI
  // ─────────────────────────────────────────────

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 18,
      }}
    >

      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
          flexWrap: 'wrap',
        }}
      >

        <div>

          <div
            style={{
              fontSize: 18,
              fontWeight: 800,
              letterSpacing: '-0.025em',
            }}
          >
            Menu
          </div>

          <div
            style={{
              fontSize: 12,
              color: T.text.muted,
              marginTop: 4,
            }}
          >
            Manage the services and prices shown to customers.
          </div>

        </div>


        {/* Actions */}
        <div
          style={{
            display: 'flex',
            gap: 8,
            flexWrap: 'wrap',
          }}
        >
          <Btn
            theme="green"
            size="sm"
            onClick={() => {
              setEditingCategory(null)
              setCategoryModalOpen(true)
            }}
            icon={<FolderPlus size={14} />}
          >
            Add Category
          </Btn>

          <Btn
            theme="green"
            size="sm"
            onClick={publishMenu}
            icon={<Send size={14} />}
          >
            Publish Menu
          </Btn>

        </div>

      </div>




      {/* Flash */}
      {message && (
  <div
    style={{
      position: 'fixed',
      top: '50%',
      left: '50%',
      transform: 'translate(-50%, -50%)',
      zIndex: 9999,

      padding: '14px 22px',
      minWidth: 260,
      maxWidth: 420,

      background: 'rgba(15, 12, 20, 0.96)',
      border: `1px solid ${G.border}`,
      borderRadius: T.r.lg,

      boxShadow: '0 20px 60px rgba(0,0,0,0.45)',
      backdropFilter: 'blur(14px)',

      fontSize: 13,
      fontWeight: 650,
      color: G.accent,

      textAlign: 'center',
      pointerEvents: 'none',
    }}
  >
    {message}
  </div>
)}


      {/* Error */}
      {error && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '10px 14px',
            background: 'rgba(239,68,68,0.10)',
            border: '1px solid rgba(239,68,68,0.22)',
            borderRadius: T.r.md,
            fontSize: 13,
            color: '#fca5a5',
          }}
        >

          <AlertCircle size={15} />

          <span style={{ flex: 1 }}>
            {error}
          </span>

          <button
            onClick={() => setError(null)}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'inherit',
              cursor: 'pointer',
            }}
          >
            <X size={15} />
          </button>

        </div>
      )}


      {/* Categories */}
      {categories.length === 0 ? (

        <Card>

          <div
            style={{
              minHeight: 180,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 12,
              textAlign: 'center',
            }}
          >

            <FolderPlus
              size={28}
              color={G.accent}
            />

            <div
              style={{
                fontSize: 14,
                fontWeight: 650,
              }}
            >
              No menu categories yet
            </div>

            <div
              style={{
                fontSize: 12,
                color: T.text.muted,
              }}
            >
              Add your first category to start building the menu.
            </div>

            <Btn
              theme="green"
              size="sm"
              onClick={() => {
                setEditingCategory(null)
                setCategoryModalOpen(true)
              }}
              icon={<Plus size={14} />}
            >
              Add Category
            </Btn>

          </div>

        </Card>

      ) : (

        categories.map(category => (

          <Card key={category.id}>

            {/* Category Header */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
              }}
            >

              <button
                onClick={() =>
                  toggleCategory(category.id)
                }
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: T.r.md,
                  background: G.a10,
                  border: `1px solid ${G.border}`,
                  color: G.accent,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}
              >

                {expandedCategories[category.id]
                  ? <ChevronUp size={16} />
                  : <ChevronDown size={16} />
                }

              </button>


              <div
                style={{
                  flex: 1,
                  minWidth: 0,
                }}
              >

                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    flexWrap: 'wrap',
                  }}
                >

                  <span
                    style={{
                      fontSize: 14,
                      fontWeight: 750,
                    }}
                  >
                    {category.name}
                  </span>

                  <Badge
                    label={
                      category.isActive
                        ? 'Visible'
                        : 'Hidden'
                    }
  color={
  category.isActive
    ? 'green'
    : 'default'
}
                  />

                </div>

                <div
                  style={{
                    fontSize: 11,
                    color: T.text.muted,
                    marginTop: 3,
                  }}
                >
                  {category.items.length} service
                  {category.items.length === 1
                    ? ''
                    : 's'}
                </div>

              </div>


              {/* Category actions */}
              <div
                style={{
                  display: 'flex',
                  gap: 6,
                  flexShrink: 0,
                }}
              >

                <Btn
                  size="sm"
                  variant="ghost"
                  theme="green"
                  onClick={() => {
                    setEditingCategory(category)
                    setCategoryModalOpen(true)
                  }}
                  icon={<Pencil size={13} />}
                >
                  Edit
                </Btn>

                <button
                  onClick={() =>
                    toggleCategoryActive(category)
                  }
                  title={
                    category.isActive
                      ? 'Hide category'
                      : 'Show category'
                  }
                  style={{
                    width: 30,
                    height: 30,
                    borderRadius: T.r.md,
                    background: category.isActive
                      ? G.a10
                      : 'rgba(255,255,255,0.04)',
                    border: `1px solid ${
                      category.isActive
                        ? G.border
                        : 'rgba(255,255,255,0.10)'
                    }`,
                    color: category.isActive
                      ? G.accent
                      : T.text.muted,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  {category.isActive
                    ? <Eye size={13} />
                    : <Eye size={13} />
                  }
                </button>

                <button
                  onClick={() =>
                    deleteCategory(category)
                  }
                  title="Delete category"
                  style={{
                    width: 30,
                    height: 30,
                    borderRadius: T.r.md,
                    background:
                      'rgba(239,68,68,0.10)',
                    border:
                      '1px solid rgba(239,68,68,0.22)',
                    cursor: 'pointer',
                    color: '#fca5a5',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Trash2 size={13} />
                </button>

              </div>

            </div>


            {/* Category Items */}
            {expandedCategories[category.id] && (

              <div
                style={{
                  marginTop: 14,
                  borderTop:
                    '1px solid rgba(255,255,255,0.06)',
                }}
              >

                {category.items.map(item => (

                  <div
                    key={item.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 12,
                      padding: '13px 0',
                      borderBottom:
                        '1px solid rgba(255,255,255,0.05)',
                    }}
                  >

                    <div
                      style={{
                        flex: 1,
                        minWidth: 0,
                      }}
                    >

                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 8,
                          flexWrap: 'wrap',
                        }}
                      >

                        <span
                          style={{
                            fontSize: 13,
                            fontWeight: 600,
                          }}
                        >
                          {item.name}
                        </span>

                        <Badge
                          label={
                            item.isActive
                              ? 'Visible'
                              : 'Hidden'
                          }
                          color={
  item.isActive
    ? 'green'
    : 'default'
}
                        />

                      </div>

                      {item.description && (
                        <div
                          style={{
                            fontSize: 11,
                            color: T.text.muted,
                            marginTop: 3,
                          }}
                        >
                          {item.description}
                        </div>
                      )}

                    </div>


                    <div
                      style={{
                        textAlign: 'right',
                        flexShrink: 0,
                      }}
                    >

                      <div
                        style={{
                          fontSize: 14,
                          fontWeight: 800,
                          color: G.accent,
                        }}
                      >
                        ₹
                        {Number(item.price).toLocaleString(
                          'en-IN'
                        )}
                      </div>

                      <div
                        style={{
                          fontSize: 10,
                          color: T.text.muted,
                          marginTop: 2,
                        }}
                      >
                        per {item.unit}
                      </div>

                    </div>


                    {/* Item actions */}
                    <div
                      style={{
                        display: 'flex',
                        gap: 5,
                        flexShrink: 0,
                      }}
                    >

                      <Btn
                        size="sm"
                        variant="ghost"
                        theme="green"
                        onClick={() => {
                          setEditingItem(item)
                          setItemModalOpen(true)
                        }}
                        icon={<Pencil size={13} />}
                      >
                        Edit
                      </Btn>

                      <button
                        onClick={() =>
                          toggleItemActive(item)
                        }
                        title={
                          item.isActive
                            ? 'Hide service'
                            : 'Show service'
                        }
                        style={{
                          width: 30,
                          height: 30,
                          borderRadius: T.r.md,
                          background: item.isActive
                            ? G.a10
                            : 'rgba(255,255,255,0.04)',
                          border: `1px solid ${
                            item.isActive
                              ? G.border
                              : 'rgba(255,255,255,0.10)'
                          }`,
                          color: item.isActive
                            ? G.accent
                            : T.text.muted,
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        <Eye size={13} />
                      </button>

                      <button
                        onClick={() =>
                          deleteItem(item)
                        }
                        title="Delete service"
                        style={{
                          width: 30,
                          height: 30,
                          borderRadius: T.r.md,
                          background:
                            'rgba(239,68,68,0.10)',
                          border:
                            '1px solid rgba(239,68,68,0.22)',
                          cursor: 'pointer',
                          color: '#fca5a5',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        <Trash2 size={13} />
                      </button>

                    </div>

                  </div>

                ))}


                {/* Add service */}
                <div
                  style={{
                    paddingTop: 12,
                  }}
                >

                  <Btn
                    size="sm"
                    variant="secondary"
                    theme="green"
                    onClick={() => {

                      setEditingItem({
                        id: 0,
                        categoryId: category.id,
                        name: '',
                        description: null,
                        price: 0,
                        unit: 'page',
                        sortOrder: category.items.length,
                        isActive: true,
                      })

                      setItemModalOpen(true)

                    }}
                    icon={<Plus size={13} />}
                  >
                    Add Service
                  </Btn>

                </div>

              </div>

            )}

          </Card>

        ))

      )}


      {/* Category Modal */}
      {categoryModalOpen && (
        <CategoryModal
          category={editingCategory}
          onClose={() => {
            setCategoryModalOpen(false)
            setEditingCategory(null)
          }}
          onSaved={async () => {
            setCategoryModalOpen(false)
            setEditingCategory(null)
            flash('Category saved.')
            await loadMenu()
          }}
        />
      )}


      {/* Item Modal */}
      {itemModalOpen && editingItem && (
        <MenuItemModal
          item={editingItem}
          categories={categories}
          onClose={() => {
            setItemModalOpen(false)
            setEditingItem(null)
          }}
          onSaved={async () => {
            setItemModalOpen(false)
            setEditingItem(null)
            flash('Service saved.')
            await loadMenu()
          }}
        />
      )}

    </div>
  )
}


// ─────────────────────────────────────────────
// CATEGORY MODAL
// ─────────────────────────────────────────────

function CategoryModal({
  category,
  onClose,
  onSaved,
}: {
  category: MenuCategory | null
  onClose: () => void
  onSaved: () => void
}) {

  const [name, setName] = useState(
    category?.name ?? ''
  )

  const [saving, setSaving] = useState(false)

  const save = async () => {

    if (!name.trim()) {
      alert('Enter a category name.')
      return
    }

    try {

      setSaving(true)

      const token = sessionStorage.getItem('pf_admin_token')

      const isEditing = Boolean(category)

      const response = await fetch(
        isEditing
          ? `${API_BASE_URL}/api/admin/menu/categories/${category!.id}`
          : `${API_BASE_URL}/api/admin/menu/categories`,
        {
          method: isEditing ? 'PATCH' : 'POST',

          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },

body: JSON.stringify({
  name: name.trim(),
}),
        }
      )

      const data = await response.json()

      if (!response.ok || !data.success) {
        throw new Error(
          data.message || 'Unable to save category.'
        )
      }

      onSaved()

    } catch (error) {

      console.error(error)

      alert(
        error instanceof Error
          ? error.message
          : 'Unable to save category.'
      )

    } finally {

      setSaving(false)

    }
  }


  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 500,
        background: 'rgba(0,0,0,0.72)',
        backdropFilter: 'blur(8px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20,
      }}
      onMouseDown={e => {
        if (e.currentTarget === e.target) {
          onClose()
        }
      }}
    >

      <div
        style={{
          width: '100%',
          maxWidth: 460,
          background: 'rgba(15,12,20,0.98)',
          border: `1px solid ${G.border}`,
          borderRadius: T.r.lg,
          boxShadow: '0 30px 80px rgba(0,0,0,0.55)',
          overflow: 'hidden',
        }}
      >

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '16px 18px',
            borderBottom:
              '1px solid rgba(255,255,255,0.07)',
          }}
        >

          <div>

            <div
              style={{
                fontSize: 15,
                fontWeight: 750,
              }}
            >
              {category
                ? 'Edit Category'
                : 'Add Category'}
            </div>

            <div
              style={{
                fontSize: 11,
                color: T.text.muted,
                marginTop: 3,
              }}
            >
              Organize services in your customer menu.
            </div>

          </div>

          <button
            onClick={onClose}
            style={{
              width: 32,
              height: 32,
              borderRadius: '50%',
              background: G.a10,
              border: `1px solid ${G.border}`,
              color: T.text.secondary,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <X size={16} />
          </button>

        </div>


        <div
          style={{
            padding: 18,
            display: 'flex',
            flexDirection: 'column',
            gap: 14,
          }}
        >

          <Input
            label="Category Name"
            value={name}
            onChange={setName}
            placeholder="e.g. ID Card Services"
            theme="green"
            autoFocus
          />

          <div
            style={{
              display: 'flex',
              justifyContent: 'flex-end',
              gap: 8,
              marginTop: 4,
            }}
          >

            <Btn
              variant="ghost"
              theme="green"
              onClick={onClose}
            >
              Cancel
            </Btn>

            <Btn
              theme="green"
              onClick={save}
              loading={saving}
              icon={<Check size={14} />}
            >
              Save Category
            </Btn>

          </div>

        </div>

      </div>

    </div>
  )
}


// ─────────────────────────────────────────────
// MENU ITEM MODAL
// ─────────────────────────────────────────────

function MenuItemModal({
  item,
  categories,
  onClose,
  onSaved,
}: {
  item: MenuItem
  categories: MenuCategory[]
  onClose: () => void
  onSaved: () => void
}) {

  const isNew = item.id === 0

  const [categoryId, setCategoryId] =
    useState(String(item.categoryId))

  const [name, setName] =
    useState(item.name)

  const [price, setPrice] =
    useState(String(item.price))

  const [unit, setUnit] =
    useState(item.unit || 'page')

  const [saving, setSaving] = useState(false)


  const save = async () => {

    if (!name.trim()) {
      alert('Enter a service name.')
      return
    }

    const numericPrice = Number(price)

    if (
      !Number.isFinite(numericPrice) ||
      numericPrice < 0
    ) {
      alert('Enter a valid price.')
      return
    }

    if (!categoryId) {
      alert('Select a category.')
      return
    }

    try {

      setSaving(true)

      const token = sessionStorage.getItem('pf_admin_token')

      const response = await fetch(
        isNew
          ? `${API_BASE_URL}/api/admin/menu/items`
          : `${API_BASE_URL}/api/admin/menu/items/${item.id}`,
        {
          method: isNew ? 'POST' : 'PATCH',

          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },

          body: JSON.stringify({
  categoryId: Number(categoryId),
  name: name.trim(),
  price: numericPrice,
  unit: unit.trim() || 'page',
}),
        }
      )

      const data = await response.json()

      if (!response.ok || !data.success) {
        throw new Error(
          data.message || 'Unable to save service.'
        )
      }

      onSaved()

    } catch (error) {

      console.error(error)

      alert(
        error instanceof Error
          ? error.message
          : 'Unable to save service.'
      )

    } finally {

      setSaving(false)

    }
  }


  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 500,
        background: 'rgba(0,0,0,0.72)',
        backdropFilter: 'blur(8px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20,
      }}
      onMouseDown={e => {
        if (e.currentTarget === e.target) {
          onClose()
        }
      }}
    >

      <div
        style={{
          width: '100%',
          maxWidth: 500,
          background: 'rgba(15,12,20,0.98)',
          border: `1px solid ${G.border}`,
          borderRadius: T.r.lg,
          boxShadow: '0 30px 80px rgba(0,0,0,0.55)',
          overflow: 'hidden',
        }}
      >

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '16px 18px',
            borderBottom:
              '1px solid rgba(255,255,255,0.07)',
          }}
        >

          <div>

            <div
              style={{
                fontSize: 15,
                fontWeight: 750,
              }}
            >
              {isNew
                ? 'Add Service'
                : 'Edit Service'}
            </div>

            <div
              style={{
                fontSize: 11,
                color: T.text.muted,
                marginTop: 3,
              }}
            >
              This information appears on the customer menu.
            </div>

          </div>

          <button
            onClick={onClose}
            style={{
              width: 32,
              height: 32,
              borderRadius: '50%',
              background: G.a10,
              border: `1px solid ${G.border}`,
              color: T.text.secondary,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <X size={16} />
          </button>

        </div>


        <div
          style={{
            padding: 18,
            display: 'flex',
            flexDirection: 'column',
            gap: 14,
          }}
        >

          {/* Category */}
          <div>

            <label
              style={{
                display: 'block',
                fontSize: 12,
                fontWeight: 600,
                color: T.text.secondary,
                letterSpacing: '0.04em',
                textTransform: 'uppercase',
                marginBottom: 6,
              }}
            >
              Category
            </label>

            <select
              value={categoryId}
              onChange={e =>
                setCategoryId(e.target.value)
              }
              style={{
                width: '100%',
                height: 48,
                padding: '0 12px',
                borderRadius: T.r.input,
                border: `1px solid ${G.border}`,
                background: 'rgba(255,255,255,0.04)',
                color: T.text.primary,
                outline: 'none',
                fontFamily: 'inherit',
                fontSize: 14,
              }}
            >

              {categories
                .filter(category => category.isActive)
                .map(category => (

                  <option
                    key={category.id}
                    value={category.id}
                    style={{
                      background: '#15121b',
                    }}
                  >
                    {category.name}
                  </option>

                ))}

            </select>

          </div>


          <Input
            label="Service Name"
            value={name}
            onChange={setName}
            placeholder="e.g. ID Card Printing"
            theme="green"
            autoFocus
          />

          <Input
            label="Price (₹)"
            value={price}
            onChange={setPrice}
            placeholder="20"
            theme="green"
          />


          {/* Unit */}
          <div>

            <label
              style={{
                display: 'block',
                fontSize: 12,
                fontWeight: 600,
                color: T.text.secondary,
                letterSpacing: '0.04em',
                textTransform: 'uppercase',
                marginBottom: 6,
              }}
            >
              Pricing Unit
            </label>

            <select
              value={unit}
              onChange={e =>
                setUnit(e.target.value)
              }
              style={{
                width: '100%',
                height: 48,
                padding: '0 12px',
                borderRadius: T.r.input,
                border: `1px solid ${G.border}`,
                background: 'rgba(255,255,255,0.04)',
                color: T.text.primary,
                outline: 'none',
                fontFamily: 'inherit',
                fontSize: 14,
              }}
            >

              <option
                value="page"
                style={{ background: '#15121b' }}
              >
                Per Page
              </option>

              <option
                value="sheet"
                style={{ background: '#15121b' }}
              >
                Per Sheet
              </option>

              <option
                value="card"
                style={{ background: '#15121b' }}
              >
                Per Card
              </option>

              <option
                value="set"
                style={{ background: '#15121b' }}
              >
                Per Set
              </option>

              <option
                value="document"
                style={{ background: '#15121b' }}
              >
                Per Document
              </option>

              <option
                value="photo"
                style={{ background: '#15121b' }}
              >
                Per Photo
              </option>

              <option
                value="piece"
                style={{ background: '#15121b' }}
              >
                Per Piece
              </option>

            </select>

          </div>

          <div
            style={{
              display: 'flex',
              justifyContent: 'flex-end',
              gap: 8,
              marginTop: 4,
            }}
          >

            <Btn
              variant="ghost"
              theme="green"
              onClick={onClose}
            >
              Cancel
            </Btn>

            <Btn
              theme="green"
              onClick={save}
              loading={saving}
              icon={<Check size={14} />}
            >
              {isNew
                ? 'Add Service'
                : 'Save Changes'}
            </Btn>

          </div>

        </div>

      </div>

    </div>
  )
}
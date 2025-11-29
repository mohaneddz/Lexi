"use client"

// import { createClient } from "@/utils/supabase/client"

import * as React from "react"
import { useEffect, useState } from "react"
import {
  User,
  Plane,
  Home,
  CreditCard,
} from "lucide-react"

import { NavMain } from "@/layout/nav-main"
import { NavUser } from "@/layout/nav-user"

import {
  Sidebar,
  useSidebar,
  SidebarHeader,
  SidebarFooter,
  SidebarContent,
  SidebarRail,
} from "@/components/ui/sidebar"
import { Button } from "@/components/ui/button"

const data = {
  user: {
    name: "Taiba Tours",
    email: "contact@taibatours.com",
    avatar: "/images/logo.png",
  },
  navMain: [
    {
      title: "Trips",
      url: "#",
      icon: Plane,
      isActive: true,
      items: [
        { title: "Active Trips", url: "/dashboard/tours/active-tours" },
        { title: "Unactive Trips", url: "/dashboard/tours/unactive-tours" },
      ],
    },
    {
      title: "Bookings",
      url: "#",
      icon: CreditCard,
      isActive: true,
      items: [
        { title: "Active Bookings", url: "/dashboard/bookings/active-bookings" },
        { title: "Unactive Bookings", url: "/dashboard/bookings/unactive-bookings" },
        { title: "Canceled Bookings", url: "/dashboard/bookings/canceled-bookings" },
      ],
    },
    {
      title: "Clients",
      url: "#",
      icon: User,
      isActive: true,
      items: [
        { title: "Active Clients", url: "/dashboard/clients/active-clients" },
        { title: "Unactive Clients", url: "/dashboard/clients/unactive-clients" },
      ],
    },
  ],
}

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const { state } = useSidebar()
  // const supabase = createClient()

  const [user, setUser] = useState({
    name: "Taiba Tours",
    email: "contact@taibatours.com",
    avatar: "/images/logo.png",
    id: "",
  })

  useEffect(() => {
    const fetchUser = async () => {
      // const { data: { user: authUser } } = await supabase.auth.getUser()
      // if (authUser) {
      //   setUser({
      //     name: authUser.user_metadata?.display_name || "User",
      //     email: authUser.email || "",
      //     avatar: authUser.user_metadata?.image || "/images/logo.png",
      //     id: authUser.id,
      //   })
      // }
      setUser({
        name: "Taiba Tours",
        email: "contact@taibatours.com",
        avatar: "/images/logo.png",
        id: "static-user-id",
      })
    }
    fetchUser()
  }, [])

  return (
    <Sidebar collapsible="icon" {...props}>
      <SidebarHeader>
        <div className="flex items-center justify-between">
          <a className="flex items-center gap-4 cursor-pointer" href="/">
            <img src="/images/logo.png" alt="Taiba Tours logo" width={40} height={40} />
            {state === "expanded" && (
              <span className="text-sm text-primary font-bold">Taiba Tours</span>
            )}
          </a>
          <Button variant="ghost" size="icon" asChild>
            <a href="/dashboard">
              <Home className="h-4 w-4" />
            </a>
          </Button>
        </div>
      </SidebarHeader>

      <SidebarContent>
        <NavMain items={data.navMain} />
      </SidebarContent>

      <SidebarFooter>
        <NavUser user={user} />
      </SidebarFooter>

      <SidebarRail />
    </Sidebar>
  )
}

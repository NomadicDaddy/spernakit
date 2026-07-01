# 📚 Spernakit Documentation

**Spernakit v3** is a production-ready enterprise application template built with React 19, TypeScript, Elysia, and Drizzle ORM. This documentation provides everything you need to build, customize, and deploy applications using the Spernakit template.

## 🚀 Quick Navigation

### **Getting Started**

- [**Getting Started Guide**](GETTING_STARTED.md) - Setup, installation, and first steps

### **Core Features**

- [**RBAC System**](RBAC.md) - Role-based access control implementation

### **Development & Customization**

- [**Developer Guide**](DEVELOPMENT.md) - Core development patterns and best practices
- [**API Reference**](API_REFERENCE.md) - Complete backend API documentation
- [**Customization Guide**](CUSTOMIZATION.md) - How to extend and modify the template

### **Security & Operations**

- [**RBAC System**](RBAC.md) - Role-based access control
- [**Security Guide**](SECURITY.md) - Consolidated security (keys, passwords, auth)
- [**Deployment Guide**](DEPLOYMENT.md) - Production deployment strategies
- [**Troubleshooting**](TROUBLESHOOTING.md) - Common issues and solutions

### **Advanced Topics**

- [**Developer Guide**](DEVELOPMENT.md) - Core development patterns and architecture

### **Migration & Technology Decisions**

- [**Why v2?**](WHY_V2.md) - Technology choices and rationale for every v1→v2 change
- [**Migration Guide (v1→v2)**](MIGRATION_V1_TO_V2.md) - Developer reorientation from v1 patterns to v2

### **Template Management**

- [**Template Changelog**](CHANGELOG.md) - Template version history and updates

---

## 🎯 Documentation by Use Case

### **I want to...**

#### **Get started with Spernakit**

1. [Getting Started Guide](GETTING_STARTED.md) - Complete setup instructions
2. [Developer Guide](DEVELOPMENT.md) - Learn the core patterns
3. [Customization Guide](CUSTOMIZATION.md) - Make it your own

#### **Customize and extend**

1. [Developer Guide](DEVELOPMENT.md) - Development patterns
2. [API Reference](API_REFERENCE.md) - Backend API patterns
3. [Customization Guide](CUSTOMIZATION.md) - Extension examples

#### **Deploy to production**

1. [Deployment Guide](DEPLOYMENT.md) - Production deployment
2. [Security Guide](SECURITY.md) - Security best practices
3. [Troubleshooting](TROUBLESHOOTING.md) - Common deployment issues

#### **Understand the architecture**

1. [Developer Guide](DEVELOPMENT.md) - Architecture overview
2. [RBAC System](RBAC.md) - Security architecture
3. [Tech Stack Reference](STACK.md) - Canonical stack documentation
4. [Why v2?](WHY_V2.md) - Technology decisions and rationale

#### **Migrate from v1**

1. [Migration Guide (v1→v2)](MIGRATION_V1_TO_V2.md) - "I did X in v1, how do I do it in v2?"
2. [Why v2?](WHY_V2.md) - Understand why each technology was replaced

#### **Solve problems**

1. [Troubleshooting](TROUBLESHOOTING.md) - Common issues and solutions
2. [API Reference](API_REFERENCE.md) - API error codes and responses

---

## 🏗️ Architecture Overview

Spernakit is built with a modern, scalable architecture:

### **Frontend Stack**

- **React 19** with TypeScript for type safety
- **TanStack Query** for server state management and caching
- **React Router** for client-side routing
- **Tailwind CSS + shadcn/ui** for styling
- **Zustand** for client state management
- **Vite 8** for fast development and building

### **Backend Stack**

- **Elysia** HTTP framework on Bun runtime
- **Drizzle ORM** for type-safe database operations
- **JWT Authentication** with role-based access control
- **SQLite** for development and production
- **Bun native WebSocket** for real-time features

### **Key Features**

- **5-Tier RBAC System** (SYSOP → ADMIN → MANAGER → OPERATOR → VIEWER)
- **Comprehensive Audit Trail** for all user actions
- **Real-time Notifications & Preferences** with WebSocket integration
- **Health Check System & Metrics** for backend and infrastructure monitoring
- **Performance Optimizations** including virtual scrolling and smart caching
- **Production-ready Security** with comprehensive validation and key management
- **Keyboard Shortcuts System** for power-user workflows
- **Docker Support** for easy deployment

---

## 📖 Documentation Standards

This documentation follows these principles:

- **Developer-First**: Organized by typical developer workflow
- **Example-Driven**: Every concept includes working code examples
- **Production-Ready**: All examples are production-quality
- **Cross-Referenced**: Related topics are linked throughout
- **Maintained**: Updated with each template release

---

## 🤝 Contributing to Documentation

Found an issue or want to improve the docs?

1. **Report Issues**: Use GitHub issues for documentation bugs
2. **Suggest Improvements**: Submit pull requests with enhancements
3. **Ask Questions**: Use GitHub discussions for clarification

---

## 📋 Documentation Structure

```
docs/template/
├── README.md                          # This file - master navigation
├── STACK.md                           # Canonical tech stack reference
├── GETTING_STARTED.md                 # Setup and first steps
├── API_REFERENCE.md                   # Complete API documentation
├── API_STANDARD.md                    # API standards and conventions
├── CONFIGURATION.md                   # Configuration guide
├── CUSTOMIZATION.md                   # Extension and modification guide
├── DEPLOYMENT.md                      # Production deployment guide
├── DEVELOPMENT.md                     # Core development patterns
├── SECURITY.md                        # Consolidated security (keys, passwords, auth)
├── RBAC.md                            # Role-based access control
├── SETTINGS_GUIDE.md                  # Settings management guide
├── TESTING.md                         # Testing guide
├── TROUBLESHOOTING.md                 # Common issues and solutions
├── WHY_V2.md                          # Technology decisions (v1→v2 rationale)
├── MIGRATION_V1_TO_V2.md              # Developer reorientation (v1→v2)
├── CHANGELOG.md                       # Template version history
├── CHANGELOG-v1.md                    # v1 version history archive
├── API_KEY_AUTHENTICATION.md          # API key auth documentation
├── adr/                               # Architecture Decision Records
│   ├── 0000-template.md
│   ├── adr-001-sqlite-database.md
│   ├── adr-002-cookie-based-jwt-auth.md
│   ├── adr-003-rbac-system.md
│   ├── adr-004-websocket-notifications.md
│   ├── adr-005-json-configuration.md
│   ├── adr-006-soft-delete-pattern.md
│   ├── adr-007-bun-package-manager.md
│   └── adr-008-component-conventions.md
└── architecture/                      # Architecture diagrams
    ├── system-architecture.md
    ├── frontend-architecture.md
    ├── backend-architecture.md
    ├── database-schema.md
    └── deployment-architecture.md
```

---

## 🚀 Quick Links

**Ready to get started?** → [**Getting Started Guide**](GETTING_STARTED.md)

**Need help?** → [**Troubleshooting Guide**](TROUBLESHOOTING.md)

**Want to customize?** → [**Customization Guide**](CUSTOMIZATION.md)

**Understand the architecture** → [**Developer Guide**](DEVELOPMENT.md)

**Coming from v1?** → [**Migration Guide**](MIGRATION_V1_TO_V2.md) | [**Why v2?**](WHY_V2.md)

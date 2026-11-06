import { PrismaClient } from '@prisma/client';
import argon2 from 'argon2';

const prisma = new PrismaClient();

async function main() {
  console.log('--- Seeding Platform Database ---');

  // 1. Create Organization
  const org = await prisma.organization.upsert({
    where: { id: '00000000-0000-0000-0000-000000000001' },
    update: {},
    create: {
      id: '00000000-0000-0000-0000-000000000001',
      name: 'Enterprise Solutions Corp',
      timezone: 'Asia/Karachi',
      retentionDays: 90,
    },
  });
  console.log(`✓ Organization created: ${org.name} (${org.id})`);

  // 2. Default Policy
  const policy = await prisma.policy.upsert({
    where: { id: '00000000-0000-0000-0000-000000000002' },
    update: {},
    create: {
      id: '00000000-0000-0000-0000-000000000002',
      organizationId: org.id,
      name: 'Standard Remote Work Policy',
      idleThresholdSec: 180,
      captureProcess: true,
      captureWindowTitle: false,
      captureScreenshots: false,
      maskedApps: JSON.stringify(['1password', 'bitwarden', 'keepass', 'whatsapp', 'telegram', 'banking']),
      scheduleJson: JSON.stringify({
        monday: { start: '09:00', end: '18:00' },
        tuesday: { start: '09:00', end: '18:00' },
        wednesday: { start: '09:00', end: '18:00' },
        thursday: { start: '09:00', end: '18:00' },
        friday: { start: '09:00', end: '18:00' },
      }),
    },
  });
  console.log(`✓ Policy created: ${policy.name}`);

  // 3. Super Admin
  const adminPasswordHash = await argon2.hash('Admin@123456');
  const admin = await prisma.user.upsert({
    where: {
      organizationId_email: {
        organizationId: org.id,
        email: 'admin@enterprise.local',
      },
    },
    update: {},
    create: {
      id: '00000000-0000-0000-0000-000000000010',
      organizationId: org.id,
      email: 'admin@enterprise.local',
      fullName: 'System Administrator',
      role: 'SUPER_ADMIN',
      passwordHash: adminPasswordHash,
      policyId: policy.id,
    },
  });
  console.log(`✓ Super Admin created: ${admin.email} (Password: Admin@123456)`);

  // 4. Team & Manager
  const managerPasswordHash = await argon2.hash('Manager@123456');
  const manager = await prisma.user.upsert({
    where: {
      organizationId_email: {
        organizationId: org.id,
        email: 'manager@enterprise.local',
      },
    },
    update: {},
    create: {
      id: '00000000-0000-0000-0000-000000000020',
      organizationId: org.id,
      email: 'manager@enterprise.local',
      fullName: 'Operations Manager',
      role: 'MANAGER',
      passwordHash: managerPasswordHash,
      policyId: policy.id,
    },
  });

  const engineeringTeam = await prisma.team.upsert({
    where: { id: '00000000-0000-0000-0000-000000000030' },
    update: {},
    create: {
      id: '00000000-0000-0000-0000-000000000030',
      organizationId: org.id,
      name: 'Engineering Team',
      managerId: manager.id,
    },
  });

  // 5. Employees
  const employeePasswordHash = await argon2.hash('Employee@123456');
  const emp1 = await prisma.user.upsert({
    where: {
      organizationId_email: {
        organizationId: org.id,
        email: 'ali.khan@enterprise.local',
      },
    },
    update: {},
    create: {
      id: '00000000-0000-0000-0000-000000000101',
      organizationId: org.id,
      teamId: engineeringTeam.id,
      policyId: policy.id,
      email: 'ali.khan@enterprise.local',
      fullName: 'Ali Khan',
      role: 'EMPLOYEE',
      passwordHash: employeePasswordHash,
    },
  });

  const emp2 = await prisma.user.upsert({
    where: {
      organizationId_email: {
        organizationId: org.id,
        email: 'sara.ahmed@enterprise.local',
      },
    },
    update: {},
    create: {
      id: '00000000-0000-0000-0000-000000000102',
      organizationId: org.id,
      teamId: engineeringTeam.id,
      policyId: policy.id,
      email: 'sara.ahmed@enterprise.local',
      fullName: 'Sara Ahmed',
      role: 'EMPLOYEE',
      passwordHash: employeePasswordHash,
    },
  });
  console.log(`✓ Sample Employees created: ${emp1.email}, ${emp2.email} (Password: Employee@123456)`);

  // 6. Sample Project & Task
  const existingProject = await prisma.project.findFirst({ where: { organizationId: org.id } });
  if (!existingProject) {
    const project = await prisma.project.create({
      data: {
        organizationId: org.id,
        name: 'Enterprise Tracking Modernization',
        description: 'Internal time tracking infrastructure modernization',
        tasks: {
          create: [
            {
              assigneeId: emp1.id,
              title: 'Implement Win32 Idle Detector',
              status: 'IN_PROGRESS',
            },
            {
              assigneeId: emp2.id,
              title: 'Build Admin Timeline Component',
              status: 'TODO',
            },
          ],
        },
      },
    });
    console.log(`✓ Sample Project & Tasks created: ${project.name}`);
  }

  console.log('\n=== Database Seeding Complete ===\n');
}

main()
  .catch((e) => {
    console.error('Seeding failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

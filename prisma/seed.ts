import { PrismaClient, UserRole } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
    // Check if admin already exists
    const existingAdmin = await prisma.user.findFirst({
        where: { role: UserRole.ADMIN },
    });

    if (existingAdmin) {
        console.log('Admin already exists:', existingAdmin.email);
        return;
    }

    // Create first admin
    const hashedPassword = await bcrypt.hash('nimda321', 10);

    const admin = await prisma.user.create({
        data: {
            email: 'admin@mitbiz.com',
            name: 'Super Admin',
            password: hashedPassword,
            role: UserRole.ADMIN,
            emailVerifiedAt: new Date(),
        },
    });

    console.log('Admin created successfully:');
    console.log('  Email:', admin.email);
    console.log('  Password: nimda321');
    console.log('  Role:', admin.role);
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });

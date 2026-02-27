import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  await prisma.achievement.createMany({
    data: [
      {
        title: 'First Login',
        description: 'Logged in for the first time',
        rarity: 'COMMON',
        icon: '🔥',
        xpReward: 20,
      },
      {
        title: 'First Lesson',
        description: 'Completed first lesson',
        rarity: 'COMMON',
        icon: '📚',
        xpReward: 50,
      },
      {
        title: '7 Day Streak',
        description: 'Logged in 7 days in a row',
        rarity: 'RARE',
        icon: '⚡',
        xpReward: 200,
      },
      {
        title: 'First Course Complete',
        description: 'Completed first course',
        rarity: 'EPIC',
        icon: '🏆',
        xpReward: 300,
      },
    ],
    skipDuplicates: true,
  });
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });